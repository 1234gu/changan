"""Bridge between the resource-pool management plane (app.pool) and the scheduler.

Ownership (single process, single repository):
- app.pool owns physical identity, approval, pool membership, the admin scheduling
  switch, logical clusters, labels and Agent-reported metrics.
- The scheduler owns tasks, sessions, placement, retries and cleanup. Execution
  rows and allocations shown on the pool pages are *queried* from the task
  database instead of being synchronised, so they cannot drift or roll back.

Two-stage admission: the pool decides which execution nodes are eligible
(management state + hard capacity); the scheduler then checks runtime feasibility
and places segments. Binding uses sha256(machine-id) reported by the Agent and
sha256(Kubernetes nodeInfo.machineID) observed by the platform.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
from contextlib import suppress
from datetime import datetime, timezone
from pathlib import Path

from . import db
from .config import DATA

logger = logging.getLogger(__name__)
MODES = ('off', 'observe', 'enforce')


def machine_digest(machine_id: str | None) -> str | None:
    value = str(machine_id or '').strip().strip('{}"').casefold()
    return hashlib.sha256(value.encode()).hexdigest() if value else None


def admission_mode() -> str:
    mode = os.getenv('CHANGAN_POOL_ADMISSION', 'observe').strip().lower()
    return mode if mode in MODES else 'observe'


def _value(v):
    return getattr(v, 'value', v)


class PoolBridge:
    def __init__(self, database_path: Path | str | None = None):
        from dataclasses import replace

        from .pool.config import Settings
        from .pool.services.cluster_service import ClusterService
        from .pool.services.node_service import NodeService
        from .pool.services.resource_aggregation import ResourceAggregationService
        from .pool.services.resource_directory import ResourceDirectoryService
        from .pool.stores.sqlite import SQLiteNodeStore

        path = database_path or os.getenv('CHANGAN_POOL_DB') or (DATA / 'pool.db')
        self.settings = replace(Settings.from_env(), node_db_path=Path(path))
        self.store = SQLiteNodeStore(self.settings.node_db_path)
        # Aggregation/candidate views read live allocations from the task database.
        self.view_store = TaskDatabaseProjectionStore(self.store, self.execution_binding_map)
        self.node_service = NodeService(store=self.store, settings=self.settings)
        self.aggregation = ResourceAggregationService(self.view_store)
        self.directory = ResourceDirectoryService(self.view_store, self.settings)
        self.cluster_service = ClusterService(self.view_store, self.aggregation)
        self._monitor: asyncio.Task | None = None

    # ---- FastAPI wiring -------------------------------------------------
    def install(self, app) -> None:
        from .pool.api import clusters, compute_pool, nodes

        app.state.node_service = self.node_service
        app.state.resource_aggregation_service = self.aggregation
        app.state.resource_directory_service = self.directory
        app.state.cluster_service = self.cluster_service
        app.state.node_store = self.store
        app.state.settings = self.settings
        app.state.pool_bridge = self
        for module in (nodes, compute_pool, clusters):
            app.include_router(module.router)
        # app.pool.api.scheduler_sync (event push + full snapshot) is intentionally not
        # mounted: app.pool_routes serves the projection straight from the task DB.

    async def start(self) -> None:
        from .pool.services.status_monitor import run_status_monitor

        if self._monitor is None:
            self._monitor = asyncio.create_task(run_status_monitor(self.node_service, self.settings), name='pool-status-monitor')

    async def stop(self) -> None:
        if self._monitor is not None:
            self._monitor.cancel()
            with suppress(asyncio.CancelledError):
                await self._monitor
            self._monitor = None
        self.store.close()

    # ---- Binding --------------------------------------------------------
    def bindings(self, execution_nodes: list[dict]) -> dict[str, dict]:
        """execution node id -> binding. Conflicts are reported, never guessed."""
        by_digest: dict[str, list] = {}
        for record in self.store.list_nodes():
            digest = record.identity.machine_id_sha256
            if digest and _value(record.registration_status) != 'REMOVED':
                by_digest.setdefault(digest, []).append(record)
        result = {}
        for node in execution_nodes:
            digest = (node.get('snapshot') or {}).get('machine_id_sha256')
            matches = by_digest.get(digest, []) if digest else []
            if not digest:
                state = 'NO_MACHINE_ID'
            elif len(matches) == 1:
                state = 'BOUND'
            elif matches:
                state = 'CONFLICT'
            else:
                state = 'UNBOUND'
            result[node['id']] = {'state': state, 'record': matches[0] if state == 'BOUND' else None}
        return result

    def execution_binding_map(self) -> dict[str, dict]:
        """execution node id -> {'pool_node_id', 'state'} from the stored K3s snapshots."""
        nodes = [{'id': r['id'], 'snapshot': db.loads(r['snapshot'], {})} for r in db.query('SELECT id,snapshot FROM nodes')]
        out = {}
        for node_id, b in self.bindings(nodes).items():
            out[node_id] = {'state': b['state'], 'pool_node_id': str(b['record'].node_id) if b['record'] else None,
                            'node_name': b['record'].node_name if b['record'] else None}
        return out

    # ---- Admission ------------------------------------------------------
    @staticmethod
    def evaluate(binding: dict) -> list[str]:
        """Management-state reasons (independent of the task)."""
        state, record = binding['state'], binding['record']
        if state == 'NO_MACHINE_ID':
            return ['资源池：K3s 未提供节点 machineID，无法绑定']
        if state == 'CONFLICT':
            return ['资源池：多个资源节点对应同一物理设备，待管理员处理']
        if state == 'UNBOUND':
            return ['资源池：未找到对应的已注册采集节点']
        reasons = []
        if _value(record.authorization_status) != 'APPROVED' or not record.ever_approved:
            reasons.append('资源池：节点未获批准接入')
        if _value(record.pool_membership) != 'IN_POOL':
            reasons.append('资源池：节点已移出算力池')
        if not record.scheduling_enabled:
            reasons.append('资源池：管理员已暂停调度')
        operational = _value(record.operational_status)
        if operational != 'ONLINE' or _value(record.runtime_status) != 'ONLINE':
            reasons.append('资源池：采集状态 ' + str(operational))
        if not reasons and not record.schedulable:
            reasons.append('资源池：节点当前不可调度')
        return reasons

    def annotate(self, nodes: list[dict]) -> list[dict]:
        """Attach pool admission info; in enforce mode the scheduler treats reasons as filters."""
        mode = admission_mode()
        if mode == 'off':
            return nodes
        try:
            bindings = self.bindings(nodes)
        except Exception as exc:  # a pool store failure must not crash scheduling
            logger.exception('resource pool unavailable')
            for n in nodes:
                n['pool'] = {'mode': mode, 'state': 'UNAVAILABLE', 'reasons': ['资源池不可用: ' + type(exc).__name__]}
            return nodes
        for n in nodes:
            binding = bindings[n['id']]
            record = binding['record']
            n['pool'] = {
                'mode': mode, 'state': binding['state'],
                'pool_node_id': str(record.node_id) if record else None,
                'node_name': record.node_name if record else None,
                'cluster_id': record.cluster_id if record else None,
                'labels': list(record.labels) if record else [],
                'cpu_cores': record.resources.cpu.logical_cores if record and record.resources else None,
                'gpu_count': record.resources.gpu.device_count if record and record.resources else None,
                'reasons': self.evaluate(binding),
            }
        return nodes


def requirement_reasons(pool: dict, params: dict) -> list[str]:
    """Task-dependent pool constraints: logical cluster, capability labels, hard capacity."""
    if pool.get('state') != 'BOUND':
        return []
    reasons = []
    cluster = params.get('pool_cluster_id')
    if cluster and pool.get('cluster_id') != cluster:
        reasons.append('资源池：不属于指定集群')
    missing = set(params.get('pool_labels') or []) - set(pool.get('labels') or [])
    if missing:
        reasons.append('资源池：缺少能力标签 ' + ','.join(sorted(missing)))
    if params.get('min_cpu_cores') and (pool.get('cpu_cores') or 0) < params['min_cpu_cores']:
        reasons.append('资源池：CPU核数不足')
    if params.get('min_gpu_count') and (pool.get('gpu_count') or 0) < params['min_gpu_count']:
        reasons.append('资源池：GPU数量不足')
    return reasons


# ---- Read models derived from the task database --------------------------
def iso(ts):
    return datetime.fromtimestamp(ts, timezone.utc).isoformat().replace('+00:00', 'Z') if ts else None


def task_statistics() -> dict:
    rows = {r['status']: r['n'] for r in db.query('SELECT status,count(*) n FROM tasks GROUP BY status')}
    waiting = sum(rows.get(s, 0) for s in ('QUEUED', 'PREPARING', 'PENDING'))
    running = sum(rows.get(s, 0) for s in ('DISPATCHING', 'RUNNING', 'FINALIZING'))
    succeeded = rows.get('SUCCEEDED', 0)
    failed = rows.get('FAILED', 0) + rows.get('TIMED_OUT', 0)
    judged = succeeded + failed
    segments = db.query("SELECT count(*) total,COALESCE(sum(status='SUCCEEDED'),0) ok,COALESCE(sum(retries),0) retries FROM segments", one=True)
    return {
        'total': sum(rows.values()), 'waiting': waiting, 'running': running, 'succeeded': succeeded,
        'failed': failed, 'canceled': rows.get('CANCELED', 0),
        'completion_rate': round(succeeded / judged, 4) if judged else None,
        'segments_total': segments['total'], 'segments_succeeded': segments['ok'], 'segment_retries': segments['retries'],
        'by_status': rows,
        'definition': '完成率=成功/(成功+失败+超时)，用户取消不计入；数据来自调度平台任务库',
    }


def node_reliability(node_id: str | None = None) -> dict:
    where, args = ('WHERE node_id=?', (node_id,)) if node_id else ('', ())
    incidents = db.query('SELECT * FROM node_incidents ' + where + ' ORDER BY detected_at DESC LIMIT 50', args)
    for row in incidents:
        row['affected'] = db.loads(row['affected'], [])
        row['recovery_seconds'] = round(row['link_restored_at'] - row['detected_at'], 1) if row.get('link_restored_at') else None
    attempts = db.query(
        "SELECT node_id,count(*) total,COALESCE(sum(status='SUCCEEDED'),0) succeeded,"
        "COALESCE(sum(status IN ('FAILED','TIMED_OUT')),0) failed FROM attempts " + where + ' GROUP BY node_id', args)
    recovered = [r['recovery_seconds'] for r in incidents if r['recovery_seconds'] is not None]
    return {
        'incidents': incidents, 'incident_count': len(incidents),
        'open_incidents': sum(1 for r in incidents if not r.get('link_restored_at')),
        'mean_recovery_seconds': round(sum(recovered) / len(recovered), 1) if recovered else None,
        'attempts': {r['node_id']: r for r in attempts},
    }


ATTEMPT_STATUS = {'PENDING': 'QUEUED', 'WAITING_SESSION': 'QUEUED', 'DISPATCHING': 'ASSIGNED', 'ACCEPTED': 'ASSIGNED',
                  'RUNNING': 'RUNNING', 'UNKNOWN': 'LOST', 'SUCCEEDED': 'SUCCEEDED', 'FAILED': 'FAILED',
                  'TIMED_OUT': 'FAILED', 'CANCELED': 'CANCELLED'}


def _session_status(row) -> str:
    if row['cleanup_state'] != 'DONE':
        # Resources stay committed until cleanup is confirmed, even after a business terminal state.
        return 'STARTING' if row['status'] == 'STARTING' else 'RUNNING'
    return {'FAILED': 'FAILED', 'CANCELED': 'CANCELLED'}.get(row['status'], 'SUCCEEDED')


def projections(pool_by_exec: dict[str, dict], *, sessions_only=False, active_only=False, task_id=None,
                physical_node_id=None, cluster_id='changan', limit=300) -> list[dict]:
    """Session (allocation) and attempt (detail) rows in app.pool projection shape.

    A live session carries one allocation (1 CPU, its memory budget, 1 GPU when granted)
    until cleanup is DONE; attempts never carry allocation, so a reused session is
    counted exactly once.
    """
    exec_ids = None
    if physical_node_id:
        exec_ids = [k for k, v in pool_by_exec.items() if v.get('pool_node_id') == physical_node_id]
        if not exec_ids:
            return []
    def scope(alias):
        clauses, args = [], []
        if task_id:
            clauses.append(alias + '.task_id=?'); args.append(task_id)
        if exec_ids is not None:
            clauses.append(alias + '.node_id IN (' + ','.join('?' * len(exec_ids)) + ')'); args += exec_ids
        return clauses, args
    clauses, args = scope('es')
    if active_only:
        clauses.append("es.cleanup_state!='DONE'")
    sessions = db.query('SELECT * FROM execution_sessions es ' + ('WHERE ' + ' AND '.join(clauses) if clauses else '')
                        + ' ORDER BY es.created DESC LIMIT ?', (*args, limit))
    out = []
    for row in sessions:
        pool = pool_by_exec.get(row['node_id'], {})
        if not pool.get('pool_node_id'):
            continue
        w = db.loads(row['workload'], {})
        out.append({
            'event_version': int(row['updated'] * 1000), 'task_id': row['task_id'], 'shard_id': None,
            'attempt_id': row['id'], 'physical_node_id': pool['pool_node_id'], 'executor_id': row['node_id'],
            'k3s': {'cluster_id': cluster_id, 'namespace': None, 'job_name': w.get('job_name'), 'pod_uid': w.get('pod_uid'), 'container_id': None},
            'status': _session_status(row),
            'allocated_resources': {'cpu_cores': 1, 'gpu_count': 1 if w.get('gpu_access') else 0, 'vram_gb': None,
                                    'memory_gb': round((w.get('memory_mb') or 0) / 1024, 3), 'npu_tops': None, 'dla_count': None},
            'queue_length': None, 'occurred_at': iso(row['updated']), 'started_at': iso(row['ready_at'] or row['created']),
            'finished_at': iso(row['finished']), 'error': row['error'], 'last_event_id': None, 'updated_at': iso(row['updated']),
            'scope': 'session', 'cleanup_state': row['cleanup_state'],
        })
    if sessions_only:
        return out
    clauses, args = scope('a')
    if active_only:
        clauses.append("a.status IN ('PENDING','WAITING_SESSION','DISPATCHING','ACCEPTED','RUNNING','UNKNOWN')")
    attempts = db.query(
        'SELECT a.*,s.ordinal FROM attempts a JOIN segments s ON s.id=a.segment_id '
        + ('WHERE ' + ' AND '.join(clauses) if clauses else '') + ' ORDER BY a.created DESC LIMIT ?', (*args, limit))
    for a in attempts:
        pool = pool_by_exec.get(a['node_id'], {})
        if not pool.get('pool_node_id'):
            continue
        out.append({
            'event_version': int(a['updated'] * 1000), 'task_id': a['task_id'], 'shard_id': 'segment-%d' % (a['ordinal'] + 1),
            'attempt_id': a['id'], 'physical_node_id': pool['pool_node_id'], 'executor_id': a['node_id'],
            'k3s': {'cluster_id': cluster_id, 'namespace': None, 'job_name': a.get('execution_id'), 'pod_uid': None, 'container_id': None},
            'status': ATTEMPT_STATUS.get(a['status'], 'QUEUED'), 'allocated_resources': None, 'queue_length': None,
            'occurred_at': iso(a['updated']), 'started_at': iso(a['started']), 'finished_at': iso(a['finished']),
            'error': a['error'], 'last_event_id': None, 'updated_at': iso(a['updated']),
            'scope': 'attempt', 'session_id': a.get('session_id'),
        })
    return out


class TaskDatabaseProjectionStore:
    """Wraps the pool store so pool aggregation reads allocations from the task database."""

    def __init__(self, inner, bindings_provider):
        self._inner = inner
        self._bindings_provider = bindings_provider

    def __getattr__(self, name):
        return getattr(self._inner, name)

    def list_scheduler_executions(self):
        from .pool.models.scheduler_execution import SchedulerExecutionProjection

        try:
            pool_by_exec = self._bindings_provider()
            rows = projections(pool_by_exec, sessions_only=True, active_only=True)
        except Exception:
            logger.exception('task database projection unavailable')
            return []
        clean = [{k: v for k, v in r.items() if k not in ('scope', 'cleanup_state', 'session_id')} for r in rows]
        return [SchedulerExecutionProjection.model_validate(r) for r in clean]

    def apply_scheduler_execution_event(self, *_args, **_kwargs):
        raise RuntimeError('执行投影由调度平台任务库提供，不接收外部事件')

    def replace_scheduler_executions(self, *_args, **_kwargs):
        raise RuntimeError('执行投影由调度平台任务库提供，不接收外部快照')


def allocations() -> dict[str, dict]:
    """Committed resources per execution node: one memory/GPU budget per live session."""
    rows = db.query("SELECT node_id,count(*) sessions,COALESCE(sum(json_extract(workload,'$.memory_mb')),0) memory_mb,"
                    "COALESCE(sum(json_extract(workload,'$.gpu_access')=1),0) gpu FROM execution_sessions "
                    "WHERE cleanup_state!='DONE' GROUP BY node_id")
    return {r['node_id']: {'sessions': r['sessions'], 'memory_mb': r['memory_mb'], 'gpu': r['gpu']} for r in rows}
