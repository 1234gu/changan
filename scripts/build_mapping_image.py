"""Build a native ARM64 OCI image on the dev server without executing target binaries.
Preserve the pinned upstream ODX filesystem and environment; append the batch adapter.
"""
import argparse, gzip, hashlib, io, json, os, tarfile, urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

ROOT=Path(__file__).resolve().parents[1]
BASE='sha256:f68dc137f97ac4668f9b2e3e81e1acfb270f13936554c98a9c340c44a872bc41'
REG='https://registry-1.docker.io/v2/webodm/odx/'

def main():
    p=argparse.ArgumentParser();p.add_argument('--prefetch',action='store_true');p.add_argument('--output',type=Path,default=ROOT/'tmp/mapping/odx-arm64.tar');a=p.parse_args()
    cache=a.output.parent/'blobs/sha256';cache.mkdir(parents=True,exist_ok=True)
    token=json.load(urllib.request.urlopen('https://auth.docker.io/token?service=registry.docker.io&scope=repository:webodm/odx:pull',timeout=30))['token']
    def fetch(d,kind='blobs'):
        dest=cache/d.split(':')[1]
        if dest.exists():
            with dest.open('rb') as f:
                if hashlib.file_digest(f,'sha256').hexdigest()==dest.name:return dest
        req=urllib.request.Request(REG+kind+'/'+d,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.oci.image.manifest.v1+json,application/vnd.docker.distribution.manifest.v2+json'})
        tmp=dest.with_suffix('.partial');h=hashlib.sha256()
        with urllib.request.urlopen(req,timeout=90) as r,tmp.open('wb') as f:
            for block in iter(lambda:r.read(1048576),b''):h.update(block);f.write(block)
        if h.hexdigest()!=dest.name:raise ValueError('base checksum mismatch')
        tmp.replace(dest);return dest
    m=json.loads(fetch(BASE,'manifests').read_bytes());cfg=json.loads(fetch(m['config']['digest']).read_bytes())
    assert (cfg['os'],cfg['architecture'])==('linux','arm64')
    with ThreadPoolExecutor(4) as ex:list(ex.map(fetch,[l['digest'] for l in m['layers']]))
    if a.prefetch:return
    def descriptor(raw,media):
        h=hashlib.sha256(raw).hexdigest();(cache/h).write_bytes(raw);return {'digest':'sha256:'+h,'size':len(raw),'mediaType':media}
    layer=io.BytesIO()
    with tarfile.open(fileobj=layer,mode='w') as t:
        for file in ['workers/mapping_worker.py','workers/photo_bundle.py']:
            raw=(ROOT/file).read_bytes();i=tarfile.TarInfo('opt/changan/'+Path(file).name);i.size=len(raw);i.mode=0o644;t.addfile(i,io.BytesIO(raw))
    raw=layer.getvalue();layers=[dict(l,mediaType='application/vnd.oci.image.layer.v1.tar+gzip') for l in m['layers']];layers.append(descriptor(gzip.compress(raw,mtime=0),'application/vnd.oci.image.layer.v1.tar+gzip'))
    cfg['rootfs']['diff_ids'].append('sha256:'+hashlib.sha256(raw).hexdigest());cfg['config'].update(Entrypoint=['python3','-u','/opt/changan/mapping_worker.py'],Cmd=[],WorkingDir='/code');cfg.setdefault('history',[]).append({'created_by':'changan mapping batch adapter'})
    dump=lambda v:json.dumps(v,separators=(',',':')).encode();conf=descriptor(dump(cfg),'application/vnd.oci.image.config.v1+json');mt='application/vnd.oci.image.manifest.v1+json';man=descriptor(dump({'schemaVersion':2,'mediaType':mt,'config':conf,'layers':layers}),mt)
    with tarfile.open(a.output,'w') as t:
        for d in [*layers,conf,man]:
            h=d['digest'][7:];t.add(cache/h,'blobs/sha256/'+h,recursive=False)
        for name,data in [('index.json',dump({'schemaVersion':2,'manifests':[man]})),('oci-layout',b'{"imageLayoutVersion":"1.0.0"}')]:
            i=tarfile.TarInfo(name);i.size=len(data);t.addfile(i,io.BytesIO(data))
    print(man['digest'],a.output,flush=True)
if __name__=='__main__':main()
