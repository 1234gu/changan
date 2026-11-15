"""Resource pool ↔ scheduler integration: binding, admission, projections, Agent auth."""
import hashlib
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import db, main
from app.config import MODEL_ID
from app.pool_bridge import machine_digest, projections, task_statistics
from app.scheduler import choose

MACHINE_ID = 'ddf7514a39054be3b68c4a9d42324676'
client = TestClient(main.app)
bridge = main.pool


@pytest.fixture(autouse=True)
def clean_pool(monkeypatch):
    for record in bridge.store.list_nodes():
        bridge.store.delete_node(record.node_id)
    monkeypatch.setenv('CHANGAN_POOL_ADMISSION', 'enforce')
    yield


def report(collected_at=None, gpu_unified=True):
    return {
        'collected_at': (collected_at or datetime.now(timezone.utc)).isoformat(),
        'cpu': {'physical_cores': 14, 'logical_cores': 14, 'utilization_percent': 3.0},
        'memory': {'total_bytes': 125 * 2**30, 'used_bytes': 30 * 2**30, 'available_bytes': 95 * 2**30, 'utilization_percent': 24.0},
        'storage': {'mount_point': '/', 'total_bytes': 900 * 2**30, 'used_bytes': 100 * 2**30, 'available_bytes': 800 * 2**30, 'utilization_percent': 11.0},
        'gpu': {'supported': True, 'available': True, 'device_count': 1, 'utilization_percent': 0.0,
                'devices': [{'index': 0, 'model': 'NVIDIA Thor', 'name': 'NVIDIA Thor', 'utilization_percent': 0.0}],
                **({'memory_architecture': 'unified'} if gpu_unified else {})},
        'npu': {'supported': False}, 'dla': {'supported': False},
        'network': {'ip': '192.168.50.151', 'network_interface': 'eth0', 'link_status': 'UP', 'bytes_sent': 1, 'bytes_received': 1},
    }


def register(machine_id=MACHINE_ID, headers=None, labels=('gpu:thor',)):
    node_id = str(uuid.uuid4())
    body = {'identity': {'node_id': node_id, 'hostname': 'localhost.localdomain', 'architecture': 'arm64',
                         'operating_system': 'Linux', 'os_version': '6.8', 'agent_version': '0.3.0', 'ip': '192.168.50.151',
                         'machine_id_sha256': hashlib.sha256(machine_id.encode()).hexdigest()},
            'device_fingerprint': 'sha256:' + hashlib.sha256(node_id.encode()).hexdigest(),
            'node_name': 'thor1', 'labels': list(labels)}
    r = client.post('/api/v1/nodes/register', json=body, headers=headers or {})
    return node_id, r


def execution_node(machine_id=MACHINE_ID):
    snapshot = {'node_id': 'lab-1', 'healthy': True, 'models': [MODEL_ID], 'available_memory_mb': 4096,
                'memory_budget_mb': 8192, 'active': 0, 'capacity': 1, 'resource_source': 'kubernetes',
                'machine_id_sha256': machine_digest(machine_id)}
    db.execute("UPDATE nodes SET observed=?,snapshot=?,error=NULL,enabled=1 WHERE id='lab-1'", (time.time(), db.dumps(snapshot)))


def approved(node_id):
    assert client.post(f'/api/v1/nodes/{node_id}/approve').status_code == 200
    assert client.post(f'/api/v1/nodes/{node_id}/resources', json=report()).status_code == 200


def lab1(params=None):
    rows = choose(main.engine.nodes(), params or {'min_memory_mb': 256}, 4, 0, {'method': 'round_robin'})
    return next(r for r in rows['candidates'] if r['node_id'] == 'lab-1')


def test_machine_id_digest_matches_kubernetes_value():
    assert machine_digest(MACHINE_ID) == hashlib.sha256(MACHINE_ID.encode()).hexdigest()
    assert machine_digest(' DDF7514A39054BE3B68C4A9D42324676\n') == machine_digest(MACHINE_ID)
    assert machine_digest(None) is None


def test_unbound_node_is_excluded_in_enforce_and_reported_in_observe(monkeypatch):
    execution_node()
    row = lab1()
    assert not row['eligible'] and '资源池：未找到对应的已注册采集节点' in row['reasons']
    monkeypatch.setenv('CHANGAN_POOL_ADMISSION', 'observe')
    row = lab1()
    assert row['eligible'] and row['pool']['reasons'] and not row['pool']['enforced']
    monkeypatch.setenv('CHANGAN_POOL_ADMISSION', 'off')
    assert lab1()['pool'] is None


def test_binding_approval_pause_and_resume_drive_admission():
    execution_node()
    node_id, r = register()
    assert r.status_code == 201
    row = lab1()
    assert not row['eligible'] and '资源池：节点未获批准接入' in row['reasons']
    approved(node_id)
    row = lab1()
    assert row['eligible'], row['reasons']
    assert row['pool']['state'] == 'BOUND' and row['pool']['pool_node_id'] == node_id
    client.post(f'/api/v1/nodes/{node_id}/disable-scheduling', json={'reason': 'maintenance'})
    row = lab1()
    assert not row['eligible'] and '资源池：管理员已暂停调度' in row['reasons']
    client.post(f'/api/v1/nodes/{node_id}/enable-scheduling', json={})
    assert lab1()['eligible']


def test_task_requirements_filter_by_cluster_labels_and_capacity():
    execution_node()
    node_id, _ = register()
    approved(node_id)
    assert lab1({'min_memory_mb': 256, 'pool_labels': ['gpu:thor'], 'min_gpu_count': 1, 'min_cpu_cores': 8})['eligible']
    reasons = lab1({'min_memory_mb': 256, 'pool_labels': ['npu'], 'min_gpu_count': 2, 'min_cpu_cores': 64, 'pool_cluster_id': 'x'})['reasons']
    assert {'资源池：缺少能力标签 npu', '资源池：GPU数量不足', '资源池：CPU核数不足', '资源池：不属于指定集群'} <= set(reasons)


def test_conflicting_machine_ids_are_never_guessed():
    execution_node()
    for _ in range(2):
        node_id, _ = register()
        approved(node_id)
    assert '资源池：多个资源节点对应同一物理设备，待管理员处理' in lab1()['reasons']


def test_stale_sample_delivered_late_is_not_fresh():
    execution_node()
    node_id, _ = register()
    approved(node_id)
    old = datetime.now(timezone.utc) - timedelta(hours=1)
    client.post(f'/api/v1/nodes/{node_id}/resources', json=report(collected_at=old))
    bridge.node_service.evaluate_heartbeat_timeouts()
    record = bridge.store.get_node(uuid.UUID(node_id))
    assert record.operational_status.value == 'ABNORMAL' and not record.schedulable
    assert '资源池：采集状态 ABNORMAL' in lab1()['reasons']


def seeded_task(status='RUNNING'):
    tid = 'task_' + uuid.uuid4().hex[:8]
    now = time.time()
    db.execute("INSERT INTO tasks(id,name,source,status,created,updated,params) VALUES(?,?,?,?,?,?,?)", (tid, 't', 'demo', status, now, now, '{}'))
    return tid


def test_session_allocation_counts_once_until_cleanup_done():
    execution_node()
    node_id, _ = register()
    approved(node_id)
    tid = seeded_task()
    now = time.time()
    w = {'job_name': 'video-session-x', 'memory_mb': 2048, 'gpu_access': True}
    db.execute("INSERT INTO execution_sessions(id,task_id,node_id,token,status,created,updated,workload,cleanup_state) VALUES('s1',?,'lab-1','t','READY',?,?,?,'PENDING')", (tid, now, now, db.dumps(w)))
    for i in range(3):
        db.execute('INSERT INTO segments(id,task_id,ordinal,start,end,path,status) VALUES(?,?,?,?,?,?,?)', (f'g{i}', tid, i, i, i + 1, '/x', 'SUCCEEDED'))
        db.execute("INSERT INTO attempts(id,task_id,segment_id,node_id,token,status,created,updated,decision,session_id,backend,cleanup_state) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                   (f'a{i}', tid, f'g{i}', 'lab-1', 't', 'SUCCEEDED', now, now, '{}', 's1', 'k3s', 'DONE'))
    rows = projections(bridge.execution_binding_map())
    assert [r['scope'] for r in rows].count('session') == 1 and [r['scope'] for r in rows].count('attempt') == 3
    allocated = [r for r in bridge.view_store.list_scheduler_executions()]
    assert len(allocated) == 1 and allocated[0].allocated_resources.gpu_count == 1
    gpu = client.get('/api/v1/compute-pool/summary').json()['resources']['gpu']
    assert gpu['allocated'] == 1
    # Business terminal but cleanup not confirmed: still committed.
    db.execute("UPDATE execution_sessions SET status='CLOSED' WHERE id='s1'")
    assert len(bridge.view_store.list_scheduler_executions()) == 1
    db.execute("UPDATE execution_sessions SET cleanup_state='DONE' WHERE id='s1'")
    assert bridge.view_store.list_scheduler_executions() == []
    listed = client.get('/api/v1/scheduler/executions').json()
    assert listed['source'] == 'task_database' and listed['total'] == 4


def test_external_projection_writes_are_not_mounted():
    assert client.put('/api/v1/scheduler/executions/snapshot', json={}).status_code in (404, 405)
    assert client.post('/api/v1/scheduler/execution-events', json={}).status_code in (404, 405)


def test_platform_summary_reports_task_statistics():
    for status in ['SUCCEEDED', 'SUCCEEDED', 'SUCCEEDED', 'FAILED', 'CANCELED', 'PENDING']:
        seeded_task(status)
    stats = task_statistics()
    assert stats['succeeded'] == 3 and stats['failed'] == 1 and stats['waiting'] == 1 and stats['canceled'] == 1
    assert stats['completion_rate'] == 0.75
    body = client.get('/api/v1/platform/summary').json()
    assert body['tasks']['completion_rate'] == 0.75 and body['admission_mode'] == 'enforce'


def test_agent_reporting_requires_agent_token_not_api_key(monkeypatch):
    monkeypatch.setattr(main, 'POOL_AGENT_TOKEN', 'agent-secret')
    monkeypatch.setattr(main, 'API_KEY', 'admin-key')
    _, r = register()
    assert r.status_code == 401
    node_id, r = register(headers={'X-Pool-Agent-Token': 'agent-secret'})
    assert r.status_code == 201
    # The agent token grants reporting only, not management.
    r = client.post(f'/api/v1/nodes/{node_id}/approve', headers={'X-Pool-Agent-Token': 'agent-secret'})
    assert r.status_code == 401


def test_gateway_forwards_only_reporting_routes():
    from app.container_api import AGENT_REPORT
    assert AGENT_REPORT.match('register') and AGENT_REPORT.match(str(uuid.uuid4()) + '/resources')
    assert not AGENT_REPORT.match(str(uuid.uuid4()) + '/approve') and not AGENT_REPORT.match('manual-connect')
