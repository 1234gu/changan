"""ODX batch entry point, running only inside the mapping image on the selected node."""
import hashlib, json, os, re, shutil, subprocess, time, zipfile
from pathlib import Path
import requests
from photo_bundle import photos


def digest(file):
    h=hashlib.sha256()
    with file.open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()

def main():
    p=json.loads(Path('/run/task/payload.json').read_text()); base=p['base_url']; http=requests.Session();http.trust_env=False
    http.headers.update({'X-Attempt-Token':p['token'],'X-Pod-UID':os.environ['POD_UID']});seq=0
    def send(endpoint,obj):
        for retry in range(4):
            try:
                r=http.post(base+endpoint,json=obj,timeout=(5,90));r.raise_for_status();return
            except requests.RequestException:
                if retry==3:raise
                time.sleep(2**retry)
    def event(state,**details):
        nonlocal seq
        seq+=1;send('/events',dict(status=state,seq=seq,**details))
    send('/claim',{});root=Path('/work/project');imgs=root/'images';imgs.mkdir(parents=True);src=root/'source.zip'; log=root/'worker.log';start=time.monotonic(); params=p['params']; os.environ.update(HOME='/work',TMPDIR='/tmp',no_ansiesc='1',OMP_NUM_THREADS=str(params['concurrency']),OPENBLAS_NUM_THREADS='1')
    try:
        event('RUNNING',phase='download');h=hashlib.sha256()
        with http.get(p['input_url'],stream=True,timeout=(5,90)) as r,src.open('wb') as f:
            r.raise_for_status()
            for b in r.iter_content(1048576):f.write(b);h.update(b)
        if h.hexdigest()!=p['input_sha256']:raise ValueError('输入摘要不符')
        with zipfile.ZipFile(src) as z:
            entries=photos(z)
            for i in entries:
                with z.open(i) as ins,(imgs/Path(i.filename).name).open('xb') as out:shutil.copyfileobj(ins,out)
        src.unlink();args=['python3','-u','/code/run.py','--project-path','/work','project','--no-gpu','--max-concurrency',str(params['concurrency']),'--feature-quality','medium','--skip-3dmodel','--orthophoto-resolution',str(params['resolution_cm'])]
        if params['preset']=='standard':args+=['--pc-quality','low','--dsm','--dem-resolution',str(params['resolution_cm'])]
        else:args+=['--fast-orthophoto']
        with log.open('w') as out,subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,errors='replace') as proc:
            for line in proc.stdout:
                out.write(line);match=re.search(r'\b(Running|Finished) ([a-z0-9_]+) stage\b',line)
                if match:event('RUNNING',phase=match[2],transition=match[1]);print(line.rstrip(),flush=True)
            rc=proc.wait()
        if rc:raise RuntimeError('ODX退出码 %s: %s'%(rc,log.read_bytes()[-850:].decode(errors='replace')))
        engine=json.loads((root/'log.json').read_text());
        if not engine.get('success') or engine.get('version')!='3.8.6':raise RuntimeError('引擎版本/完成状态不符')
        ortho=root/'odm_orthophoto/odm_orthophoto.tif'; shot=root/'odm_report/shots.geojson'; registered=len(json.loads(shot.read_text())['features']);
        if not 0<registered<=len(entries):raise ValueError('无有效重建照片或照片数量异常')
        from osgeo import gdal
        ds=gdal.Open(str(ortho));srs=ds.GetSpatialRef();gt=ds.GetGeoTransform();w,h=ds.RasterXSize,ds.RasterYSize
        if not srs or not w or not h or not gt[1]:raise ValueError('正射图缺少地理参考');
        corners=[gdal.ApplyGeoTransform(gt,x,y) for x,y in ((0,0),(0,h),(w,0),(w,h))];epsg=srs.GetAuthorityCode(None)
        prev=root/'preview.jpg'; thumb=gdal.Translate(str(prev),ds,format='JPEG',width=min(1024,w),height=0,bandList=list(range(1,min(3,ds.RasterCount)+1))); assert thumb is not None;thumb=None
        files={'orthophoto.tif':ortho,'preview.jpg':prev,'report.pdf':root/'odm_report/report.pdf','engine.json':root/'log.json','shots.geojson':shot};quality={'registered':registered,'images':len(entries),'width':w,'height':h,'crs':srs.GetName(),'epsg':epsg,'corners':corners,'pixel_size':[gt[1],abs(gt[5])]}
        if params['preset']=='standard':
            files.update({'dsm.tif':root/'odm_dem/dsm.tif','cloud.laz':root/'odm_georeferencing/odm_georeferenced_model.laz'});dem=gdal.Open(str(files['dsm.tif']));assert dem and dem.GetSpatialRef();laz=files['cloud.laz'];
            with laz.open('rb') as fp:hdr=fp.read(375)
            points=int.from_bytes(hdr[107:111],'little') or (int.from_bytes(hdr[247:255],'little') if hdr[25]>=4 else 0)
            if hdr[:4]!=b'LASF' or points<=0:raise ValueError('无效LAZ点云')
            quality['points']=points
        event('UPLOADING',phase='upload');manifest=[]
        for name,file in files.items():
            sha=digest(file)
            for retry in range(3):
                try:
                    with file.open('rb') as stream:r=http.put(base+'/artifacts/'+name,data=stream,headers={'X-Content-SHA256':sha},timeout=(8,180));r.raise_for_status()
                    break
                except requests.RequestException:
                    if retry==2:raise
                    time.sleep(2**retry)
            manifest.append({'name':name,'bytes':file.stat().st_size,'sha256':sha})
        event('FINALIZING',result={'application_id':'aerial-mapping-odx','engine_version':engine['version'],'input_sha256':p['input_sha256'],'attempt_id':p['attempt_id'],'task_id':p['task_id'],'work_unit_id':p['segment_id'],'pod_uid':os.environ['POD_UID'],'actual_node':p['target_node'],'artifacts':manifest,'quality':quality,'device':'cpu','elapsed_seconds':round(time.monotonic()-start,2)})
    except Exception as e:
        event('FAILED',error=str(e)[-950:]);raise
if __name__=='__main__':main()
