"""Control-plane/worker-contract tests; fake bytes are NOT reconstruction evidence."""
import hashlib,io,json,tarfile,time,zipfile
from types import SimpleNamespace as NS
import pytest
from fastapi.testclient import TestClient
from app import db,mapping,mapping_pipeline as pipe
from app.main import app
from app.config import DATA

@pytest.fixture
def pipeline(monkeypatch):
    monkeypatch.setenv('CHANGAN_MAPPING_IMAGE','r/base@sha256:'+'1'*64)
    monkeypatch.setenv('CHANGAN_MAPPING_COLLAB_IMAGE','r/collab@sha256:'+'2'*64)
    raw=io.BytesIO()
    with zipfile.ZipFile(raw,'w') as z:
        for i in range(8):z.writestr('images/p%s.JPG'%i,b'\xff\xd8\xff'+bytes([i]))
    cli=TestClient(app);d=cli.post('/api/datasets',files={'file':('flight.zip',raw.getvalue())}).json()
    params=mapping.MappingInput(workflow_id=mapping.ID,source=d['id'],execution_mode='collaborative',submodel_size=4,split_overlap_m=25,preset='preview')
    tid=mapping.create(NS(backend='k3s'),params)
    return tid,params,cli

def plan():
    return {'version':1,'images':['p%s.JPG'%i for i in range(8)],'submodels':[{'id':'submodel_0000','images':['p%s.JPG'%i for i in range(6)]},{'id':'submodel_0001','images':['p%s.JPG'%i for i in range(2,8)]}],'split_size':4,'overlap_m':25,'overlap_edges':[]}

def attempt(tid,unit,node='thor2'):
    aid=db.uid('try');spec=pipe.get(unit['id']);deps=pipe.inputs(unit);now=time.time()
    w={'id':mapping.ID,'execution_mode':'batch_job','image':'r/collab@sha256:'+'2'*64,'job_uid':'job-'+aid,'pod_uid':'pod-'+aid,'node_name':node,'input_sha256':pipe.input_hash(deps) if deps else db.task_detail(tid)['metadata']['input']['sha256'],'phase':spec['phase'],'submodel':spec['submodel'],'inputs':deps}
    db.execute('INSERT INTO attempts(id,task_id,segment_id,node_id,actual_node,token,status,created,updated,decision,backend,cleanup_state,workload) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',(aid,tid,unit['id'],node,node,'token','RUNNING',now,now,'{}','k3s','PENDING',db.dumps(w)))
    db.execute("UPDATE segments SET active_attempt=?,status='RUNNING' WHERE id=?",(aid,unit['id']))
    a=db.query('SELECT * FROM attempts WHERE id=?',(aid,),one=True)
    r={'application_id':mapping.ID,'engine_version':'3.8.6','attempt_id':aid,'task_id':tid,'work_unit_id':unit['id'],'actual_node':node,'pod_uid':w['pod_uid'],'input_sha256':w['input_sha256'],'device':'cpu','phase':spec['phase'],'submodel':spec['submodel'],'inputs':deps,'metrics':{'download_bytes':10,'compute_seconds':2},'artifacts':[]}
    if spec['phase']=='prepare':r['plan']=plan();names=['parent.tar.gz']+['seed-'+g['id']+'.tar.gz' for g in plan()['submodels']]
    elif spec['phase']=='align':names=['aligned-'+g['id']+'.tar.gz' for g in plan()['submodels']]
    elif spec['phase']=='merge':
        names=list((mapping.required('preview')-{'report.pdf'})|{'collaboration.json'})
        r['quality']={'images':8,'registered':8,'width':10,'height':10,'crs':'test CRS','submodels':['submodel_0000','submodel_0001']}
    else:names=['state.tar.gz']
    folder=DATA/'tasks'/tid/aid;folder.mkdir(parents=True)
    for name in names:
        content=('fixture:'+name).encode();(folder/name).write_bytes(content);sha=hashlib.sha256(content).hexdigest()
        db.execute('INSERT INTO artifacts VALUES(?,?,?,?)',(aid,name,len(content),sha));r['artifacts'].append({'name':name,'bytes':len(content),'sha256':sha})
    return a,w,r

def finish(a,r):
    mapping.complete(a,{'result':r});db.execute("UPDATE attempts SET cleanup_state='DONE' WHERE id=?",(a['id'],))

def units(tid,phase):return [u for u in db.task_detail(tid)['segments'] if u['kind']=='mapping_'+phase]

def test_graph_expansion_gating_and_final_publish(pipeline):
    tid,p,cli=pipeline;prepare=units(tid,'prepare')[0];assert pipe.ready(prepare)
    a,w,r=attempt(tid,prepare);finish(a,r)
    t=db.task_detail(tid);assert t['total']==7 and len(t['work_units'])==7 and t['status']=='RUNNING'
    # Repeated completion is fenced and cannot duplicate graph expansion.
    mapping.complete(a,{'result':r});assert len(db.task_detail(tid)['work_units'])==7
    sparse=units(tid,'reconstruct');align=units(tid,'align')[0]
    assert all(pipe.ready(u) for u in sparse) and not pipe.ready(align)
    a,w,r=attempt(tid,sparse[0]);finish(a,r);assert not pipe.ready(align)
    a,w,r=attempt(tid,sparse[1],node='thor3');finish(a,r);assert pipe.ready(align)
    dense=units(tid,'toolchain');assert not any(pipe.ready(u) for u in dense)
    a,w,r=attempt(tid,align);finish(a,r);assert all(pipe.ready(u) for u in dense)
    merge=units(tid,'merge')[0]
    for u in dense:
        assert not pipe.ready(merge)
        a,w,r=attempt(tid,u);finish(a,r)
    assert pipe.ready(merge)
    a,w,r=attempt(tid,merge);public=f'/api/tasks/{tid}/artifacts/{a["id"]}/preview.jpg'
    assert cli.get(public).status_code==404
    finish(a,r);t=db.task_detail(tid)
    assert t['status']=='SUCCEEDED' and t['completed']==t['total']==7
    assert sorted(t['result']['collaboration']['compute_nodes'])==['thor2','thor3']
    assert cli.get(public).status_code==200
    # Internal seed archives are not public download artifacts, even after success.
    assert cli.get(f'/api/tasks/{tid}/artifacts/{t["attempts"][0]["id"]}/parent.tar.gz').status_code==404

@pytest.mark.parametrize('mutation',['coverage','duplicate','disconnected','size','unknown','nan'])
def test_invalid_plan_rejected(pipeline,mutation):
    tid,p,_=pipeline;t=db.task_detail(tid);q=plan()
    if mutation=='coverage':q['submodels'][1]['images'].pop()
    if mutation=='duplicate':q['submodels'][1]=q['submodels'][0]
    if mutation=='disconnected':q['submodels'][0]['images']=q['images'][:4];q['submodels'][1]['images']=q['images'][4:]
    if mutation=='size':q['split_size']=99
    if mutation=='unknown':q['submodels'][1]['images'].append('foreign.JPG')
    if mutation=='nan':q['overlap_m']=float('nan')
    with pytest.raises(ValueError):pipe.check_plan(q,t['metadata'],p.model_dump())

@pytest.mark.parametrize('mutation',['sha','lineage','phase','pod','metrics','missing','tampered'])
def test_result_fencing(pipeline,mutation):
    tid,p,_=pipeline;a,w,r=attempt(tid,units(tid,'prepare')[0])
    if mutation=='sha':r['artifacts'][0]['sha256']='0'*64
    if mutation=='lineage':r['inputs']=[{'fake':True}]
    if mutation=='phase':r['phase']='merge'
    if mutation=='pod':r['pod_uid']='foreign'
    if mutation=='metrics':r['metrics']['compute_seconds']=float('nan')
    if mutation=='missing':r['artifacts'].pop()
    if mutation=='tampered':(DATA/'tasks'/tid/a['id']/r['artifacts'][0]['name']).write_bytes(b'x'*r['artifacts'][0]['bytes'])
    with pytest.raises(ValueError):pipe.validate_result(a,w,r,verify_content=True)

def test_dependency_access_is_attempt_scoped(pipeline):
    tid,p,cli=pipeline;a,w,r=attempt(tid,units(tid,'prepare')[0]);finish(a,r)
    parent=a['id'];u=units(tid,'reconstruct')[0];a,w,r=attempt(tid,u)
    headers={'X-Attempt-Token':'token','X-Pod-UID':w['pod_uid']}
    endpoint=f'/internal/container/{a["id"]}/dependency/0'
    assert cli.get(endpoint,headers=headers).status_code==200
    assert cli.get(endpoint).status_code==401
    assert cli.get(endpoint,headers=dict(headers,**{'X-Pod-UID':'old'})).status_code==409
    assert cli.get(endpoint[:-1]+'1',headers=headers).status_code==404
    assert cli.get(f'/internal/container/{a["id"]}/input',headers=headers).status_code==403
    # A changed producer generation invalidates both dependency reads and completion.
    db.execute("UPDATE segments SET active_attempt='different' WHERE id=?",(w['inputs'][0]['unit_id'],))
    assert cli.get(endpoint,headers=headers).status_code==409
    with pytest.raises(ValueError):pipe.validate_result(a,w,r)


def test_retry_waits_for_cleanup_and_parallel_nodes_are_distinct(pipeline):
    tid,p,_=pipeline;a,w,r=attempt(tid,units(tid,'prepare')[0]);finish(a,r)
    u=units(tid,'reconstruct')[0];a,w,r=attempt(tid,u)
    db.execute("UPDATE attempts SET status='FAILED' WHERE id=?",(a['id'],));db.execute("UPDATE segments SET status='PENDING' WHERE id=?",(u['id'],))
    assert not pipe.ready(u)
    db.execute("UPDATE attempts SET cleanup_state='DONE' WHERE id=?",(a['id'],));assert pipe.ready(u)
    a,w,r=attempt(tid,u);nodes=pipe.scheduling_nodes([{'id':'thor2'},{'id':'thor3'}],db.query('SELECT * FROM tasks WHERE id=?',(tid,),one=True))
    assert nodes[0]['session_blocked'] and not nodes[1].get('session_blocked')

@pytest.mark.parametrize('kind',['traversal','absolute','link','device','duplicate','oversize'])
def test_safe_archive(monkeypatch,tmp_path,kind):
    monkeypatch.syspath_prepend('workers');from mapping_pipeline_worker import extract
    p=tmp_path/'state.tar.gz'
    with tarfile.open(p,'w:gz') as t:
        m=tarfile.TarInfo({'traversal':'project/../bad','absolute':'/project/bad'}.get(kind,'project/file'))
        if kind=='link':m.type=tarfile.SYMTYPE;m.linkname='/etc/passwd'
        elif kind=='device':m.type=tarfile.CHRTYPE
        else:m.size=2
        t.addfile(m,io.BytesIO(b'xx'))
        if kind=='duplicate':t.addfile(m,io.BytesIO(b'xx'))
    with pytest.raises(ValueError):extract(p,tmp_path/'dest',1 if kind=='oversize' else 100)

@pytest.mark.asyncio
async def test_submit_observation_race_keeps_new_job(monkeypatch):
    from test_container_execution import seed_container,FakeKube
    e,c,tid=seed_container()
    db.execute("UPDATE attempts SET workload=? WHERE id='a1'",(db.dumps({'execution_mode':'batch_job','job_name':'mapping-a1'}),))
    class ConcurrentSubmit(FakeKube):
        async def job(self,name):
            row=db.query("SELECT workload FROM attempts WHERE id='a1'",one=True);w=db.loads(row['workload']);w['job_uid']='new-job';db.execute("UPDATE attempts SET workload=? WHERE id='a1'",(db.dumps(w),));return None
    c.kube=ConcurrentSubmit();await c.reconcile_one(db.query("SELECT * FROM attempts WHERE id='a1'",one=True))
    a=db.query("SELECT * FROM attempts WHERE id='a1'",one=True)
    assert a['status'] not in ('FAILED','CANCELED') and a['cleanup_state']=='PENDING'
