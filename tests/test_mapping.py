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

@pytest.mark.asyncio
async def test_batch_fenced_finalization_and_download():
    """Pod callbacks stage files; only the current successful attempt publishes them."""
    from test_container_execution import seed_container,headers,job,pod,FakeKube
    e,c,tid=seed_container(); w=db.loads(db.query("SELECT workload FROM attempts WHERE id='a1'",one=True)['workload'])|{'id':mapping.ID,'execution_mode':'batch_job'}
    db.execute("UPDATE attempts SET workload=? WHERE id='a1'",(db.dumps(w),));db.execute("UPDATE tasks SET params=?,metadata=?,total=1 WHERE id=?",(db.dumps({'preset':'preview','attempt_timeout':60,'max_retries':0,'workflow_id':mapping.ID}),db.dumps({'input':{'image_count':3}}),tid));db.execute("DELETE FROM segments WHERE id='s2'")
    cli=TestClient(app);base='/internal/container/a1';q={'images':3,'registered':3,'crs':'test','width':1,'height':1,'corners':[[0,0]]*4,'pixel_size':[1,1]};r={'application_id':mapping.ID,'engine_version':'3.8.6','task_id':tid,'attempt_id':'a1','work_unit_id':'s1','pod_uid':'p1','actual_node':'lab-1','input_sha256':'inputhash','device':'cpu','artifacts':[],'quality':q}
    def event(result):return cli.post(base+'/events',json={'seq':1,'status':'FINALIZING','result':result},headers=headers())
    public=f'/api/tasks/{tid}/artifacts/a1/preview.jpg';content=b'checked';sha=hashlib.sha256(content).hexdigest();bad='a'*64
    assert event(r).status_code==422
    for name in sorted(mapping.required('preview')):
        uri=base+'/artifacts/'+name
        assert cli.put(uri,headers=headers()|{'x-content-sha256':bad},content=content).status_code==422
        assert cli.put(uri,headers=headers()|{'x-content-sha256':sha},content=content).status_code==200
        r['artifacts'].append(dict(name=name,bytes=len(content),sha256=sha))
    assert cli.get(public).status_code==404 and event(r|{'pod_uid':'stale'}).status_code==422
    assert event(r|{'quality':q|{'width':0}}).status_code==422
    assert event(r|{'artifacts':[m|{'sha256':bad} for m in r['artifacts']]}).status_code==422
    assert event(r).status_code==200 and cli.get(public).status_code==404
    c.kube=FakeKube(job(),[pod('Succeeded')]);await c.reconcile();assert db.task_detail(tid)['status']=='SUCCEEDED' and cli.get(public).content==content
    assert cli.post(base+'/events',headers=headers(),json={'seq':2,'status':'RUNNING'}).status_code==409
    assert 'result' not in db.task_detail(tid)['work_units'][0];await e.close()

@pytest.mark.asyncio
async def test_batch_job_quota_event_and_no_fake_success():
    from test_container_execution import seed_container,job,pod,FakeKube
    e,c,tid=seed_container();w=db.loads(db.query("SELECT workload FROM attempts WHERE id='a1'",one=True)['workload'])|{'id':mapping.ID,'execution_mode':'batch_job'};w.pop('pod_uid');db.execute("UPDATE attempts SET created=?,workload=? WHERE id='a1'",(time.time()-15,db.dumps(w)))
    class Quota(FakeKube):
        async def pod_events(self,uid):return [NS(reason='FailedCreate',message='exceeded quota: video-budget')]
    c.kube=Quota(job(),[]);await c.reconcile();assert db.query("SELECT id FROM events WHERE type='job_admission'")
    c.kube.pod_values=[pod('Succeeded')];await c.reconcile();assert db.task_detail(tid)['status']!='SUCCEEDED' and db.task_detail(tid)['attempts'][0]['workload']['terminal_after_cleanup']=='FAILED';await e.close()

def test_invalid_registry_digest(monkeypatch):
    monkeypatch.setenv('CHANGAN_MAPPING_IMAGE','registry/odx@sha256:bad')
    with pytest.raises(ValueError):mapping.application()
    assert not mapping.applications()[1]['enabled']
