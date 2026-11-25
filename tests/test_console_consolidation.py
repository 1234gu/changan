"""Task-side consolidation (2026-11-25): template-aware candidate preview, strategy↔template binding, call statistics."""
import io, time, zipfile
from fastapi.testclient import TestClient
from app import db, mapping
from app.main import app


def dataset(client):
    raw = io.BytesIO()
    with zipfile.ZipFile(raw, 'w') as z:
        for i in range(3):
            z.writestr(f'set/images/flight_{i}.JPG', b'\xff\xd8\xff' + bytes([i]))
    res = client.post('/api/datasets', files={'file': ('example.zip', raw.getvalue())})
    assert res.status_code == 200, res.text
    return res.json()['id']


def test_candidate_preview_accepts_both_templates():
    client = TestClient(app)
    video = client.post('/api/scheduling/candidates', json={'params': {'node_ids': ['lab-1']}, 'duration_seconds': 4})
    assert video.status_code == 200, video.text
    body = video.json()
    assert body['workflow_id'] == 'video-analysis'
    assert all('不在指定节点范围' in c['reasons'] for c in body['candidates'] if c['node_id'] != 'lab-1')
    did = dataset(client)
    mapped = client.post('/api/scheduling/candidates', json={'params': {'workflow_id': mapping.ID, 'source': did, 'concurrency': 6}})
    assert mapped.status_code == 200, mapped.text
    req = mapped.json()['requirements']
    assert req['application_id'] == mapping.ID and req['min_cpu_cores'] == 6 and req['min_gpu_count'] == 0
    assert mapped.json()['workflow_id'] == mapping.ID
    # Mapping-only fields cannot leak into a video request (both models forbid extras).
    assert client.post('/api/scheduling/candidates', json={'params': {'preset': 'standard'}}).status_code == 422


def test_strategy_binds_mapping_template(monkeypatch):
    client = TestClient(app)
    did = dataset(client)
    r = client.post('/api/strategies', json={'name': 'map', 'kind': 'service',
                                             'params': {'workflow_id': mapping.ID, 'source': did, 'preset': 'preview'}})
    assert r.status_code == 200, r.text
    sid = r.json()['id']
    saved = next(s for s in client.get('/api/strategies').json() if s['id'] == sid)
    assert saved['params']['workflow_id'] == mapping.ID and saved['params']['preset'] == 'preview'
    from app.main import engine
    # Process backend: mapping requires K3s, the trigger reports a clear 422 instead of a 500.
    monkeypatch.setattr(engine, 'backend', 'process')
    assert client.post(f'/api/strategies/{sid}/trigger').status_code == 422
    monkeypatch.setattr(engine, 'backend', 'k3s')
    monkeypatch.setenv('CHANGAN_MAPPING_IMAGE', 'registry/mapping@sha256:' + '1' * 64)
    res = client.post(f'/api/strategies/{sid}/trigger')
    assert res.status_code == 200, res.text
    task = db.task_detail(res.json()['id'])
    assert task['strategy_id'] == sid and task['trigger_type'] == 'service'
    assert task['params']['workflow_id'] == mapping.ID
    client.delete('/api/strategies/' + sid)


def test_call_statistics_by_day_and_workflow():
    client = TestClient(app)
    now = time.time()
    rows = [('s1', 'SUCCEEDED', 'video-analysis', 'service'), ('s2', 'FAILED', 'video-analysis', 'periodic'),
            ('s3', 'CANCELED', 'video-analysis', 'service'), ('s4', 'SUCCEEDED', mapping.ID, 'service'),
            ('s5', 'RUNNING', mapping.ID, 'service')]
    for tid, status, wf, trig in rows:
        db.execute("INSERT INTO tasks(id,name,source,status,created,updated,params,trigger_type) VALUES(?,?,?,?,?,?,?,?)",
                   ('task_stat_' + tid, tid, 'demo', status, now, now, db.dumps({'workflow_id': wf}), trig))
    db.execute("INSERT INTO tasks(id,name,source,status,created,updated,params) VALUES(?,?,?,?,?,?,?)",
               ('task_stat_old', 'old', 'demo', 'SUCCEEDED', now - 40 * 86400, now, db.dumps({'workflow_id': 'video-analysis'})))
    data = client.get('/api/overview/statistics?days=7').json()
    by = {w['workflow_id']: w for w in data['by_workflow']}
    v, m = by['video-analysis'], by[mapping.ID]
    assert (v['total'], v['succeeded'], v['failed'], v['canceled'], v['periodic']) == (3, 1, 1, 1, 1)
    assert v['success_rate'] == 0.5  # canceled excluded from the denominator
    assert (m['total'], m['active'], m['success_rate']) == (2, 1, 1.0)
    assert sum(r['total'] for r in data['rows']) == 5  # 40-day-old record outside the window
    assert client.get('/api/overview/statistics?days=0').status_code == 422
