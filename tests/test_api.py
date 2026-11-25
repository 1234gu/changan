from fastapi.testclient import TestClient
from app.main import app
from app import db

def test_strategy_crud_and_service_trigger():
    client=TestClient(app)
    r=client.post('/api/strategies',json={'name':'test','kind':'service','params':{'name':'triggered'}})
    assert r.status_code==200,r.text
    id=r.json()['id']
    response=client.post(f'/api/strategies/{id}/trigger');assert response.status_code==200
    task=db.task_detail(response.json()['id']);assert task['strategy_id']==id and task['trigger_type']=='service'
    client.delete('/api/strategies/'+id)
    assert not client.get('/api/strategies').json()
def test_security_and_input_validation():
    client=TestClient(app)
    assert client.get('/internal/segments/unknown').status_code==401
    assert client.post('/api/tasks',json={'source':'../../etc/passwd'}).status_code==422
    assert client.post('/api/tasks',json={'segment_seconds':0}).status_code==422
    assert client.post('/api/tasks',json={},headers={'Origin':'https://foreign.example'}).status_code==403
def test_algorithm_registration_and_validation():
    client=TestClient(app)
    assert client.post('/api/configs/algorithm',json={'body':{'method':'shell'}}).status_code==422
    result=client.post('/api/configs/algorithm',json={'name':'v2','body':{'method':'resource_aware','weights':{'compute':2}}})
    assert result.status_code==200
    assert client.delete('/api/configs/algorithm/'+result.json()['id']).status_code==200

def test_api_key_browser_cookie_protects_media_and_exports(monkeypatch):
    import app.main as main
    monkeypatch.setattr(main,'API_KEY','unit-test-key')
    client=TestClient(app)
    assert client.get('/api/tasks').status_code==401
    assert client.post('/api/session',json={'api_key':'wrong'}).status_code==401
    assert client.post('/api/session',json={'api_key':'unit-test-key'}).status_code==200
    assert client.get('/api/tasks').status_code==200
    assert 'HttpOnly' in client.post('/api/session',json={'api_key':'unit-test-key'}).headers['set-cookie']


def test_overview_pages_include_running_and_all_history():
    client = TestClient(app)
    assert client.get('/api/overview/tasks').json()['items'] == []
    params = '{"workflow_id":"video-analysis","algorithm":"resource_aware"}'
    with db.connect() as conn:
        conn.executemany(
            'INSERT INTO tasks (id,name,source,status,created,updated,params) VALUES (?,?,?,?,?,?,?)',
            [(f'task-{i:04}', '测试任务', 'demo', 'SUCCEEDED' if i else 'RUNNING',
              i // 2, i, params) for i in range(512)])
    pages = [client.get('/api/overview/tasks', params={'page': i, 'page_size': 100}).json()
             for i in range(1, 7)]
    rows = [row for page in pages for row in page['items']]
    assert pages[0]['totals'] == {'RUNNING': 1, 'SUCCEEDED': 511}
    assert pages[-1]['pages'] == 6 and len(pages[-1]['items']) == 12
    assert [row['id'] for row in rows] == ['task-0000'] + [f'task-{i:04}' for i in range(511, 0, -1)]
    assert 'result' not in rows[0] and 'metadata' not in rows[0]
    assert rows[-1]['params'] == db.loads(params)
    assert client.get('/api/tasks/' + rows[-1]['id']).json()['id'] == 'task-0001'
    assert client.get('/api/overview/tasks?page=500&page_size=100').json() == pages[-1]
