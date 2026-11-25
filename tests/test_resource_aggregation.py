from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest

from app.pool.models.node import (
    AuthorizationStatus,
    HealthStatus,
    IdentityPayload,
    NodeOperationalStatus,
    NodeRecord,
    PoolMembership,
    RegistrationStatus,
    ResourceReportRequest,
    RuntimeStatus,
)
from app.pool.models.scheduler_execution import (
    AllocatedResources,
    SchedulerExecutionProjection,
    SchedulerExecutionStatus,
)
from app.pool.services.resource_aggregation import (
    aggregate_cluster_resources,
    aggregate_compute_pool,
    scheduler_allocation_totals,
)

GIB = 1024**3


def _report(
    *,
    cpu: int,
    cpu_utilization: float,
    vram: int,
    vram_used: int,
    memory: int,
    memory_used: int,
    storage: int,
    storage_used: int,
    npu_tops: float,
    npu_utilization: float,
    dla_count: int,
    dla_utilization: float,
) -> ResourceReportRequest:
    now = datetime.now(timezone.utc)
    return ResourceReportRequest.model_validate(
        {
            "collected_at": now,
            "cpu": {
                "physical_cores": cpu,
                "logical_cores": cpu,
                "utilization_percent": cpu_utilization,
            },
            "memory": {
                "total_bytes": memory * GIB,
                "used_bytes": memory_used * GIB,
                "available_bytes": (memory - memory_used) * GIB,
                "utilization_percent": memory_used / memory * 100,
            },
            "storage": {
                "mount_point": "/",
                "total_bytes": storage * GIB,
                "used_bytes": storage_used * GIB,
                "available_bytes": (storage - storage_used) * GIB,
                "utilization_percent": storage_used / storage * 100,
            },
            "gpu": {
                "supported": True,
                "available": True,
                "device_count": 1,
                "total_vram_bytes": vram * GIB,
                "used_vram_bytes": vram_used * GIB,
                "available_vram_bytes": (vram - vram_used) * GIB,
                "utilization_percent": vram_used / vram * 100,
                "memory_architecture": "dedicated",
                "devices": [
                    {
                        "index": 0,
                        "model": "test-gpu",
                        "name": "test-gpu",
                        "utilization_percent": vram_used / vram * 100,
                        "vram_total_bytes": vram * GIB,
                        "vram_used_bytes": vram_used * GIB,
                        "vram_available_bytes": (vram - vram_used) * GIB,
                    }
                ],
            },
            "npu": {
                "supported": True,
                "available": True,
                "tops": npu_tops,
                "utilization_percent": npu_utilization,
            },
            "dla": {
                "supported": True,
                "available": True,
                "device_count": dla_count,
                "utilization_percent": dla_utilization,
            },
            "network": {
                "ip": "192.0.2.1",
                "network_interface": "eth0",
                "link_status": "UP",
                "bytes_sent": 1,
                "bytes_received": 1,
            },
        }
    )


def _node(
    name: str,
    report: ResourceReportRequest,
    *,
    runtime: RuntimeStatus = RuntimeStatus.ONLINE,
    operational: NodeOperationalStatus = NodeOperationalStatus.ONLINE,
    registration: RegistrationStatus = RegistrationStatus.REGISTERED,
    authorization: AuthorizationStatus = AuthorizationStatus.APPROVED,
    membership: PoolMembership = PoolMembership.IN_POOL,
    schedulable: bool = True,
) -> NodeRecord:
    now = datetime.now(timezone.utc)
    node_id = uuid4()
    return NodeRecord(
        node_id=node_id,
        node_name=name,
        identity=IdentityPayload(
            node_id=node_id,
            hostname=name,
            architecture="arm64",
            operating_system="Linux",
            os_version="test",
            agent_version="test",
            ip="192.0.2.1",
        ),
        registration_status=registration,
        ever_approved=authorization == AuthorizationStatus.APPROVED,
        authorization_status=authorization,
        pool_membership=membership,
        runtime_status=runtime,
        operational_status=operational,
        health_status=HealthStatus.HEALTHY,
        scheduling_enabled=schedulable,
        schedulable=schedulable,
        discovered_at=now,
        last_registered_at=now,
        registered_at=now,
        last_heartbeat_at=now,
        last_resource_at=now,
        resources=report,
    )


@pytest.fixture
def online_nodes() -> tuple[NodeRecord, NodeRecord]:
    first = _node(
        "online-a",
        _report(
            cpu=14,
            cpu_utilization=10,
            vram=8,
            vram_used=2,
            memory=64,
            memory_used=16,
            storage=200,
            storage_used=50,
            npu_tops=16,
            npu_utilization=30,
            dla_count=2,
            dla_utilization=40,
        ),
    )
    second = _node(
        "online-b",
        _report(
            cpu=8,
            cpu_utilization=90,
            vram=4,
            vram_used=3,
            memory=32,
            memory_used=24,
            storage=100,
            storage_used=75,
            npu_tops=8,
            npu_utilization=70,
            dla_count=1,
            dla_utilization=60,
        ),
    )
    return first, second


def _assert_first_node_only(summary) -> None:
    assert summary.resources.cpu.total == 14
    assert summary.resources.cpu.runtime_utilization_percent == 10
    assert summary.resources.gpu.total == 1
    assert summary.video_memory.total == 8
    assert summary.video_memory.used == 2
    assert summary.memory.total == 64
    assert summary.memory.used == 16
    assert summary.storage.total == 200
    assert summary.storage.used == 50
    assert summary.resources.npu.total == 16
    assert summary.resources.dla.total == 2


@pytest.mark.parametrize(
    ("runtime", "operational"),
    [
        (RuntimeStatus.OFFLINE, NodeOperationalStatus.OFFLINE),
        (RuntimeStatus.SUSPECT, NodeOperationalStatus.SUSPECT),
        (RuntimeStatus.ONLINE, NodeOperationalStatus.ABNORMAL),
        (RuntimeStatus.RECONNECTING, NodeOperationalStatus.SUSPECT),
    ],
)
def test_non_online_snapshots_are_retained_but_excluded_from_every_metric(
    online_nodes: tuple[NodeRecord, NodeRecord],
    runtime: RuntimeStatus,
    operational: NodeOperationalStatus,
) -> None:
    first, second = online_nodes
    stale_snapshot = second.resources
    unavailable = second.model_copy(
        update={"runtime_status": runtime, "operational_status": operational}
    )

    summary = aggregate_compute_pool([first, unavailable])

    _assert_first_node_only(summary)
    assert unavailable.resources is stale_snapshot


def test_recovery_rejoins_current_capacity_and_cluster_uses_same_set(
    online_nodes: tuple[NodeRecord, NodeRecord],
) -> None:
    first, second = online_nodes
    offline = second.model_copy(
        update={
            "runtime_status": RuntimeStatus.OFFLINE,
            "operational_status": NodeOperationalStatus.OFFLINE,
        }
    )
    _assert_first_node_only(aggregate_compute_pool([first, offline]))

    recovered = offline.model_copy(
        update={
            "runtime_status": RuntimeStatus.ONLINE,
            "operational_status": NodeOperationalStatus.ONLINE,
        }
    )
    pool = aggregate_compute_pool([first, recovered])
    cluster = aggregate_cluster_resources([first, recovered])

    assert pool.resources.cpu.total == cluster.resources.cpu.total == 22
    assert pool.video_memory.total == cluster.video_memory.total == 12
    assert pool.memory.total == cluster.memory.total == 96
    assert pool.storage.total == cluster.storage.total == 300
    assert pool.resources.npu.total == cluster.resources.npu.total == 24
    assert pool.resources.dla.total == cluster.resources.dla.total == 3
    assert pool.resources.cpu.runtime_utilization_percent == 39.1


def test_removed_unapproved_and_deleted_nodes_do_not_contribute(
    online_nodes: tuple[NodeRecord, NodeRecord],
) -> None:
    first, second = online_nodes
    removed = second.model_copy(update={"pool_membership": PoolMembership.REMOVED})
    unapproved = second.model_copy(
        update={
            "ever_approved": False,
            "authorization_status": AuthorizationStatus.PENDING,
        }
    )

    _assert_first_node_only(aggregate_compute_pool([first, removed, unapproved]))
    # A deleted node is absent from the input collection and therefore cannot contribute.
    _assert_first_node_only(aggregate_compute_pool([first]))


def _execution(node_id: UUID, cpu: float) -> SchedulerExecutionProjection:
    now = datetime.now(timezone.utc)
    return SchedulerExecutionProjection(
        event_version=1,
        task_id=f"task-{node_id}",
        attempt_id=f"attempt-{node_id}",
        physical_node_id=node_id,
        status=SchedulerExecutionStatus.RUNNING,
        allocated_resources=AllocatedResources(
            cpu_cores=cpu,
            gpu_count=1,
            vram_gb=2,
            memory_gb=4,
            npu_tops=2,
            dla_count=1,
        ),
        occurred_at=now,
        updated_at=now,
    )


def test_online_paused_node_keeps_physical_total_but_not_schedulable_capacity(
    online_nodes: tuple[NodeRecord, NodeRecord],
) -> None:
    first, second = online_nodes
    paused = second.model_copy(
        update={"scheduling_enabled": False, "schedulable": False}
    )
    allocations = scheduler_allocation_totals(
        [first, paused], [_execution(first.node_id, 2), _execution(paused.node_id, 3)]
    )
    summary = aggregate_compute_pool([first, paused], allocations=allocations)

    assert summary.resources.cpu.total == 22
    assert summary.resources.cpu.schedulable_available == 14
    assert summary.resources.cpu.allocated == 5
    assert summary.memory.total == 96
    assert summary.memory.schedulable_available == 48


def test_scheduler_allocations_from_offline_nodes_are_excluded(
    online_nodes: tuple[NodeRecord, NodeRecord],
) -> None:
    first, second = online_nodes
    offline = second.model_copy(
        update={
            "runtime_status": RuntimeStatus.OFFLINE,
            "operational_status": NodeOperationalStatus.OFFLINE,
        }
    )
    active_allocations = scheduler_allocation_totals(
        [first], [_execution(first.node_id, 2), _execution(offline.node_id, 7)]
    )
    summary = aggregate_compute_pool([first, offline], allocations=active_allocations)

    assert summary.resources.cpu.allocated == 2
    assert summary.resources.gpu.allocated == 1
    assert summary.video_memory.allocated == 2
    assert summary.memory.allocated == 4
    assert summary.resources.npu.allocated == 2
    assert summary.resources.dla.allocated == 1
