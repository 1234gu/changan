import io,json,time,zipfile,hashlib
from types import SimpleNamespace as NS
import pytest
from fastapi.testclient import TestClient
from app import db,mapping
from app.main import app
from app.scheduler import choose
from workers.photo_bundle import photos


def archive(extra=()):
    raw=io.BytesIO()
    with zipfile.ZipFile(raw,'w') as z:
        for i in range(3):z.writestr(f'set/images/flight_{i}.JPG',b'\xff\xd8\xff'+bytes([i]))
        z.writestr('set/demo.jpg',b'reference only');z.writestr('set/model.laz',b'old');
        for k,v in extra:z.writestr(k,v)
    return raw.getvalue()

def test_upload_and_submit(monkeypatch):
    client=TestClient(app);res=client.post('/api/datasets',files={'file':('example.zip',archive())});assert res.status_code==200,res.text
    did=res.json()['id'];assert res.json()['image_count']==3
    p={'workflow_id':mapping.ID,'source':did};assert client.post('/api/tasks',json=p).status_code==422
    from app.main import engine
    monkeypatch.setattr(engine,'backend','k3s');monkeypatch.setenv('CHANGAN_MAPPING_IMAGE','registry/mapping@sha256:'+'1'*64)
    r=client.post('/api/tasks',json=p,headers={'Idempotency-Key':'map1'});assert r.status_code==200,r.text;t=r.json()['task'];assert t['work_units'][0]['kind']=='photo_reconstruction' and t['total']==1
    assert client.post('/api/tasks',json=p,headers={'Idempotency-Key':'map1'}).json()['id']==t['id'];assert client.post('/api/tasks',json=p|{'sample_fps':12}).status_code==422
    assert client.post('/api/tasks',json={'workflow_id':'generic','source':'demo'}).status_code==422
    assert [v['id'] for v in client.get('/api/applications').json()]==['video-analysis',mapping.ID]

@pytest.mark.parametrize('extra',[[('../wrong',b'x')],[('set/images/bad.JPG',b'bad')],[('other/images/z.jpg',b'\xff\xd8\xff')]])
def test_invalid_dataset(extra):
    with pytest.raises(ValueError):photos(zipfile.ZipFile(io.BytesIO(archive(extra))))

def test_batch_manifest_and_scheduler():
    p=mapping.MappingInput(workflow_id=mapping.ID,source='dataset_'+'a'*16).model_dump();w={'job_name':'mapping-a','image':'r@sha256:'+'1'*64,'architecture':'arm64','kube_node':'thor2'};a={'id':'a','node_id':'thor2'};m=mapping.manifest(a,w,p);spec=m['spec']['template']['spec'];c=spec['containers'][0];assert spec['nodeSelector']['changan.io/node-id']=='thor2' and c['name']=='mapping' and 'nvidia.com/gpu' not in c['resources']['requests'];assert c['resources']['requests']['ephemeral-storage']=='32Gi'
    n={'id':'thor2','enabled':1,'observed':time.time(),'snapshot':{'node_id':'thor2','healthy':True,'architecture':'arm64','cpu_cores':14,'ephemeral_storage_gb':100,'memory_budget_mb':65000,'available_memory_mb':65000,'capacity':1}}
    params=mapping.candidate_params(p);r=choose([n],params,0,123,{});assert r['target_node']=='thor2' and r['candidates'][0]['compute_seconds'] is None
    n['snapshot']['ephemeral_storage_gb']=2;assert not choose([n],params,0,123,{})['target_node']

def test_required_contract():
    assert mapping.required('standard')-mapping.required('preview')=={'cloud.laz','dsm.tif'}
    with pytest.raises(ValueError):mapping.validate_result({'id':'x','node_id':'n','task_id':'t','segment_id':'u'},{'pod_uid':'p','input_sha256':'h'},{})
