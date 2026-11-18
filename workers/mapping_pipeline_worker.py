"""Thor-only mapping DAG worker. Safe, checksummed, explicit stage transfers."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tarfile
import time
import zipfile
import requests
from photo_bundle import photos

ROOT=Path('/work/project')

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()

def extract(archive,root,limit):
    """No links/devices/traversal, bounded expansion and unique entries per archive.
    Different dependencies intentionally overlay aligned reconstruction/config files.
    """
    total=0;seen=set()
    with tarfile.open(archive,'r:gz') as t:
        for m in t:
            p=PurePosixPath(m.name)
            if p.is_absolute() or '..' in p.parts or not p.parts or p.parts[0]!='project' or '\\' in m.name or m.name in seen or not (m.isdir() or m.isfile()):raise ValueError('中间归档包含非法路径、链接或重复成员')
            seen.add(m.name);total+=m.size
            if total>limit or len(seen)>100000:raise ValueError('中间归档超过展开配额')
            dest=root.joinpath(*p.parts)
            if m.isdir():dest.mkdir(parents=True,exist_ok=True)
            else:
                dest.parent.mkdir(parents=True,exist_ok=True)
                with t.extractfile(m) as src,dest.open('wb') as out:shutil.copyfileobj(src,out)
    return total

def pack(destination,paths):
    """Materialize ODX internal symlinks; never send links to the control plane."""
    seen=set()
    with tarfile.open(destination,'w:gz',compresslevel=1,dereference=True) as t:
        for path in paths:
            members=[path] if path.is_file() else [Path(d)/n for d,_,names in os.walk(path,followlinks=True) for n in sorted(names)]
            for f in members:
                if not f.is_file():continue
                if not f.resolve().is_relative_to(ROOT):raise ValueError('ODX中间文件链接离开工作区')
                name=str(f.relative_to(ROOT.parent))
                if name in seen:continue
                seen.add(name);t.add(f,arcname=name,recursive=False)

def final_products(root,plan,preset):
    from osgeo import gdal
    engine=json.loads((root/'log.json').read_text())
    if not engine.get('success') or engine.get('version')!='3.8.6':raise ValueError('融合引擎未成功退出或版本不符')
    ortho=root/'odm_orthophoto/odm_orthophoto.tif';shot=root/'odm_report/shots.geojson'
    features=json.loads(shot.read_text())['features']
    # Upstream merge_geojson_shots deduplicates by filename/id.
    expected={}
    for g in plan['submodels']:
        sub=json.loads((root/'submodels'/g['id']/'odm_report/shots.geojson').read_text())['features']
        names={f['properties']['filename'] for f in sub}
        if not names or not names<=set(g['images']):raise ValueError('子模型配准照片来源无效')
        expected.update({f['properties']['filename']:f for f in sub})
    names={f['properties']['filename'] for f in features}
    if names!=set(expected):raise ValueError('融合相机清单未包含所有子模型成果')
    # Pinned upstream fails to update its dedup set after the first model.
    # Normalize the public merged camera list; do not count duplicates as coverage.
    merged=json.loads(shot.read_text());merged['features']=list(expected.values())
    shot.write_text(json.dumps(merged));registered=len(expected)
    ds=gdal.Open(str(ortho));srs=ds.GetSpatialRef() if ds else None
    if not srs or ds.RasterXSize<=0 or ds.RasterYSize<=0:raise ValueError('融合正射图缺少空间参考')
    gt=ds.GetGeoTransform();w,h=ds.RasterXSize,ds.RasterYSize
    preview=root/'preview.jpg'
    thumb=gdal.Translate(str(preview),ds,format='JPEG',width=min(1024,w),height=0,bandList=list(range(1,min(3,ds.RasterCount)+1)))
    if thumb is None:raise ValueError('预览生成失败')
    thumb=None
    quality={'images':len(plan['images']),'registered':registered,'width':w,'height':h,'crs':srs.GetName(),'epsg':srs.GetAuthorityCode(None),'corners':[gdal.ApplyGeoTransform(gt,x,y) for x,y in ((0,0),(0,h),(w,0),(w,h))],'pixel_size':[gt[1],abs(gt[5])],'submodels':[g['id'] for g in plan['submodels']]}
    files={'orthophoto.tif':ortho,'preview.jpg':preview,'engine.json':root/'log.json','shots.geojson':shot}
    if preset=='standard':
        files.update({'dsm.tif':root/'odm_dem/dsm.tif','cloud.laz':root/'odm_georeferencing/odm_georeferenced_model.laz'})
        dem=gdal.Open(str(files['dsm.tif']))
        if not dem or not dem.GetSpatialRef():raise ValueError('融合DSM无效')
        with files['cloud.laz'].open('rb') as f:header=f.read(375)
        points=int.from_bytes(header[107:111],'little') or (int.from_bytes(header[247:255],'little') if header[25]>=4 else 0)
        if header[:4]!=b'LASF' or points<=0:raise ValueError('融合点云无效')
        quality['points']=points
    report=root/'collaboration.json'
    report.write_text(json.dumps({'kind':'mapping-collaboration-report','engine':'ODX 3.8.6','plan':plan,'quality':quality,'note':'子模型全量融合检查与配准覆盖；不等同于GCP测量精度验收'},ensure_ascii=False,indent=2))
    files['collaboration.json']=report
    return files,quality

def main(p):
    base=p['base_url'];http=requests.Session();http.trust_env=False
    http.headers.update({'X-Attempt-Token':p['token'],'X-Pod-UID':os.environ['POD_UID']})
    seq=0;started=time.monotonic();params=p['params'];phase=p['phase'];group=p['submodel']
    metrics={'download_bytes':0,'download_seconds':0,'compute_seconds':0,'pack_seconds':0,'upload_bytes':0,'upload_seconds':0}
    def post(endpoint,body):
        for retry in range(4):
            try:
                r=http.post(base+endpoint,json=body,timeout=(5,120));r.raise_for_status();return
            except requests.RequestException:
                if retry==3:raise
                time.sleep(2**retry)
    def event(status,**kwargs):
        nonlocal seq
        seq+=1;post('/events',dict(status=status,seq=seq,**kwargs))
    def download(url,dest,expected,expected_size=None):
        t=time.monotonic();size=0;h=hashlib.sha256()
        with http.get(url,stream=True,timeout=(8,180)) as r,dest.open('wb') as f:
            r.raise_for_status()
            for b in r.iter_content(1048576):
                size+=len(b)
                if size>4*1024**3:raise ValueError('下载超过配额')
                h.update(b);f.write(b)
        metrics['download_seconds']+=time.monotonic()-t;metrics['download_bytes']+=size
        if h.hexdigest()!=expected or (expected_size is not None and size!=expected_size):raise ValueError('阶段输入摘要/大小不符')
    post('/claim',{})
    ROOT.mkdir(parents=True,exist_ok=True)
    os.environ.update(HOME='/work',TMPDIR='/tmp',no_ansiesc='1',OMP_NUM_THREADS=str(params['concurrency']),OPENBLAS_NUM_THREADS='1')
    try:
        event('RUNNING',phase='download')
        if phase=='prepare':
            archive=ROOT/'input.zip';download(p['input_url'],archive,p['input_sha256'])
            imgs=ROOT/'images';imgs.mkdir()
            with zipfile.ZipFile(archive) as z:
                for i in photos(z):
                    with z.open(i) as src,(imgs/Path(i.filename).name).open('xb') as dst:shutil.copyfileobj(src,dst)
            archive.unlink()
        else:
            total=0
            for index,entry in enumerate(p['inputs']):
                dest=ROOT.parent/('input-%s.tar.gz'%index)
                download(base+'/dependency/'+str(index),dest,entry['sha256'],entry['bytes'])
                total+=extract(dest,ROOT.parent,params['workspace_gb']*1024**3-total)
                dest.unlink()
        if phase=='merge':
            merge_plan=json.loads((ROOT/'plan.json').read_text())
            if {d.name for d in (ROOT/'submodels').iterdir() if d.is_dir()}!={g['id'] for g in merge_plan['submodels']}:raise ValueError('融合输入子模型集合不一致')
            required=['odm_orthophoto/odm_orthophoto_cut.tif','odm_orthophoto/odm_orthophoto_feathered.tif','odm_report/shots.geojson']
            if params['preset']=='standard':required+=['odm_dem/dsm.tif','odm_georeferencing/odm_georeferenced_model.laz']
            for g in merge_plan['submodels']:
                if any(not (ROOT/'submodels'/g['id']/n).is_file() for n in required):raise ValueError('缺失子模型成果，拒绝部分融合')
        project=ROOT/'submodels'/group if group else ROOT
        if phase=='reconstruct':(project/'opensfm/split_merge_stop_at_reconstruction.txt').touch()
        if phase=='toolchain':
            (project/'opensfm/split_merge_stop_at_reconstruction.txt').unlink(missing_ok=True)
            # Matches/features were consumed before alignment. Explicit upstream seed markers
            # prevent recomputation; aligned tracks/reconstruction are authoritative.
            for d in ('features','matches','exif'):
                (project/'opensfm'/d).mkdir(exist_ok=True)
                (project/'opensfm'/d/'empty').touch()
        argv=['python3','-u','/opt/changan/mapping_odx_stage.py','--project-path',str(project.parent),project.name,'--no-gpu','--max-concurrency',str(params['concurrency']),'--feature-quality','medium','--skip-3dmodel','--orthophoto-resolution',str(params['resolution_cm'])]
        if params['preset']=='standard':argv+=['--pc-quality','low','--dsm','--dem-resolution',str(params['resolution_cm'])]
        else:argv+=['--fast-orthophoto']
        if phase=='prepare':argv+=['--split',str(params['submodel_size']),'--split-overlap',str(params['split_overlap_m'])]
        if phase in ('reconstruct','toolchain'):argv+=['--orthophoto-cutline','--dem-euclidean-map','--skip-report','--crop','0.015625']
        os.environ['CHANGAN_MAPPING_PHASE']=phase
        event('RUNNING',phase=phase,transition='Running');compute=time.monotonic();log=ROOT/'stage-worker.log'
        with log.open('w') as out,subprocess.Popen(argv,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,errors='replace') as proc:
            for line in proc.stdout:
                out.write(line);print(line.rstrip(),flush=True)
                match=re.search(r'\b(Running|Finished) ([a-z0-9_]+) stage\b',line)
                if match:event('RUNNING',phase=match[2],transition=match[1])
            code=proc.wait()
        metrics['compute_seconds']=time.monotonic()-compute
        if code:raise RuntimeError('ODX阶段退出码%s: %s'%(code,log.read_bytes()[-1200:].decode(errors='replace')))
        event('RUNNING',phase=phase,transition='Finished')
        packing=time.monotonic();out=ROOT.parent/'out';out.mkdir();files={};quality=None;plan=None
        if phase=='prepare':
            plan=json.loads((ROOT/'plan.json').read_text())
            parent=out/'parent.tar.gz';pack(parent,[x for x in ROOT.iterdir() if x.name not in ('images','submodels','stage-worker.log')]);files[parent.name]=parent
            for g in plan['submodels']:
                file=out/('seed-'+g['id']+'.tar.gz');pack(file,[ROOT/'submodels'/g['id']]);files[file.name]=file
        elif phase=='reconstruct':
            recon=json.loads((project/'opensfm/reconstruction.json').read_text())
            if not recon or not any(r.get('shots') for r in recon):raise ValueError('子模型没有有效稀疏重建')
            file=out/'state.tar.gz';pack(file,[project/'opensfm'/n for n in ('image_list.txt','config.yaml','camera_models.json','reference_lla.json','reconstruction.json','tracks.csv')]);files[file.name]=file
        elif phase=='align':
            plan=json.loads((ROOT/'plan.json').read_text())
            for g in plan['submodels']:
                sp=ROOT/'submodels'/g['id']/'opensfm';file=out/('aligned-'+g['id']+'.tar.gz')
                pack(file,[sp/n for n in ('image_list.txt','config.yaml','camera_models.json','reference_lla.json','reconstruction.json','tracks.csv')]);files[file.name]=file
        elif phase=='toolchain':
            required=['odm_orthophoto/odm_orthophoto_cut.tif','odm_orthophoto/odm_orthophoto_feathered.tif','odm_orthophoto/cutline.gpkg','odm_report/shots.geojson']
            if params['preset']=='standard':required+=['odm_dem/dsm.tif','odm_georeferencing/odm_georeferenced_model.laz']
            if any(not (project/n).is_file() or not (project/n).stat().st_size for n in required):raise ValueError('子模型地理成果不完整')
            file=out/'state.tar.gz';pack(file,[project/n for n in ('odm_orthophoto','odm_dem','odm_report','odm_georeferencing','cameras.json')]);files[file.name]=file
        else:
            plan=json.loads((ROOT/'plan.json').read_text())
            expected={g['id'] for g in plan['submodels']}
            actual={d.name for d in (ROOT/'submodels').iterdir() if d.is_dir()}
            if actual!=expected:raise ValueError('融合前子模型清单不一致')
            files,quality=final_products(ROOT,plan,params['preset'])
        metrics['pack_seconds']=time.monotonic()-packing
        event('UPLOADING',phase='upload');manifest=[]
        for name,file in files.items():
            sha=digest(file);t=time.monotonic()
            for retry in range(3):
                try:
                    with file.open('rb') as stream:r=http.put(base+'/artifacts/'+name,data=stream,headers={'X-Content-SHA256':sha},timeout=(8,240));r.raise_for_status()
                    break
                except requests.RequestException:
                    if retry==2:raise
                    time.sleep(2**retry)
            metrics['upload_seconds']+=time.monotonic()-t;metrics['upload_bytes']+=file.stat().st_size
            manifest.append({'name':name,'sha256':sha,'bytes':file.stat().st_size})
        result={'application_id':'aerial-mapping-odx','engine_version':'3.8.6','input_sha256':p['input_sha256'],'attempt_id':p['attempt_id'],'task_id':p['task_id'],'work_unit_id':p['segment_id'],'pod_uid':os.environ['POD_UID'],'actual_node':p['target_node'],'phase':phase,'submodel':group,'inputs':p['inputs'],'device':'cpu','artifacts':manifest,'metrics':metrics,'elapsed_seconds':time.monotonic()-started}
        if phase=='prepare':result['plan']=plan
        if quality:result['quality']=quality
        event('FINALIZING',phase=phase,result=result)
    except Exception as e:
        event('FAILED',phase=phase,error=str(e)[-1600:]);raise
