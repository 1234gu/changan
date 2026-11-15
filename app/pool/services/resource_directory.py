from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from ..config import Settings
from ..models.node import (
    AuthorizationStatus,
    HealthStatus,
    NodeOperationalStatus,
    NodeRecord,
    PoolMembership,
    RegistrationStatus,
    RuntimeStatus,
)
from ..models.resource_candidate import (
    CandidateAggregateCapacity,
    CandidateCapacity,
    CandidateExclusionReason,
    CandidateNodeSnapshot,
    CandidateQueryRequest,
    CandidateQueryResponse,
    CandidateResourceAvailability,
    CandidateRuntimeAdvisory,
    ClusterAggregateCapacity,
    ClusterScope,
    ExcludedCandidateNode,
    ExecutionMode,
    ResourceAvailabilityState,
    ResourceRequirement,
)
from ..models.scheduler_execution import (
    ACTIVE_ALLOCATION_STATUSES,
    SchedulerExecutionProjection,
)
from ..stores.base import NodeStore


class CrossClusterExecutionNotSupportedError(ValueError):
    code = "CROSS_CLUSTER_EXECUTION_NOT_SUPPORTED"


class AllowedNodesCrossClusterError(ValueError):
    code = "ALLOWED_NODES_CROSS_CLUSTER_NOT_ALLOWED"


GIB = 1024**3


def _canonical_architecture(value: str) -> str:
    normalized = value.strip().lower()
    return {
        "amd64": "x86_64",
        "x64": "x86_64",
        "aarch64": "arm64",
    }.get(normalized, normalized)


def _round(value: float) -> float:
    return round(max(0, value), 2)


def _gib(value: int | None) -> float:
    return _round((value or 0) / GIB)


@dataclass(slots=True)
class _NodeAllocations:
    cpu_cores: float = 0
    gpu_count: int = 0
    vram_gb: float = 0
    memory_gb: float = 0
    npu_tops: float = 0
    dla_count: int = 0
    unknown: set[str] = field(default_factory=set)


def _allocation_by_node(
    executions: list[SchedulerExecutionProjection],
) -> dict[UUID, _NodeAllocations]:
    result: dict[UUID, _NodeAllocations] = {}
    resource_fields = {
        "cpu": "cpu_cores",
        "gpu_count": "gpu_count",
        "vram": "vram_gb",
        "memory": "memory_gb",
        "npu": "npu_tops",
        "dla": "dla_count",
    }
    for execution in executions:
        if execution.status not in ACTIVE_ALLOCATION_STATUSES:
            continue
        allocation = result.setdefault(execution.physical_node_id, _NodeAllocations())
        resources = execution.allocated_resources
        if resources is None:
            allocation.unknown.update(resource_fields)
            continue
        for resource_name, field_name in resource_fields.items():
            value = getattr(resources, field_name)
            if value is None:
                allocation.unknown.add(resource_name)
                continue
            setattr(allocation, field_name, getattr(allocation, field_name) + value)
    return result


def _state(
    total: float,
    available: float,
    *,
    unknown: bool = False,
) -> ResourceAvailabilityState:
    if total <= 0:
        return ResourceAvailabilityState.NOT_PRESENT
    if available <= 0:
        return ResourceAvailabilityState.BUSY
    if unknown:
        return ResourceAvailabilityState.UNKNOWN
    if available < total:
        return ResourceAvailabilityState.PARTIAL
    return ResourceAvailabilityState.FREE


def _gpu_device_vram(node: NodeRecord) -> list[float]:
    report = node.resources
    if report is None or not report.gpu.supported or report.gpu.error:
        return []
    values = [_gib(device.vram_total_bytes) for device in report.gpu.devices]
    if values and all(value > 0 for value in values):
        return values
    if report.gpu.device_count == 1 and report.gpu.total_vram_bytes > 0:
        return [_gib(report.gpu.total_vram_bytes)]
    return []


class ResourceDirectoryService:
    """Build capacity candidates without performing final Scheduler placement."""

    def __init__(self, store: NodeStore, settings: Settings) -> None:
        self._store = store
        self._settings = settings

    @staticmethod
    def _snapshot(
        node: NodeRecord,
        allocation: _NodeAllocations,
    ) -> CandidateNodeSnapshot:
        report = node.resources
        if report is None:
            capacity = CandidateCapacity(
                cpu_cores=0,
                gpu_count=0,
                vram_total_gb=0,
                max_gpu_vram_gb=0,
                npu_tops=0,
                dla_count=0,
                memory_total_gb=0,
            )
            available = capacity.model_copy(deep=True)
            advisory = CandidateRuntimeAdvisory()
        else:
            gpu = report.gpu
            npu = report.npu
            dla = report.dla
            device_vram = _gpu_device_vram(node)
            gpu_count = gpu.device_count if gpu.supported and not gpu.error else 0
            gpu_total_vram = (
                _gib(gpu.total_vram_bytes) if gpu.supported and not gpu.error else 0
            )
            capacity = CandidateCapacity(
                cpu_cores=report.cpu.physical_cores or report.cpu.logical_cores,
                gpu_count=gpu_count,
                vram_total_gb=gpu_total_vram,
                max_gpu_vram_gb=max(device_vram, default=gpu_total_vram),
                npu_tops=npu.tops if npu.supported and not npu.error else 0,
                dla_count=dla.device_count if dla.supported and not dla.error else 0,
                memory_total_gb=_gib(report.memory.total_bytes),
            )

            busy_gpu_count = min(
                gpu_count,
                max(allocation.gpu_count, 1 if allocation.vram_gb > 0 else 0),
            )
            free_gpu_count = max(0, gpu_count - busy_gpu_count)
            if busy_gpu_count == 0:
                free_device_vram = device_vram
                free_vram = gpu_total_vram
            elif device_vram:
                # The projection has no GPU device index. Remove the largest
                # devices first to expose a conservative guaranteed remainder.
                free_device_vram = sorted(device_vram, reverse=True)[busy_gpu_count:]
                free_vram = sum(free_device_vram)
            else:
                free_device_vram = []
                free_vram = 0

            npu_available = 0 if allocation.npu_tops > 0 else capacity.npu_tops
            available = CandidateCapacity(
                cpu_cores=max(0, int(capacity.cpu_cores - allocation.cpu_cores)),
                gpu_count=free_gpu_count,
                vram_total_gb=_round(free_vram),
                max_gpu_vram_gb=max(free_device_vram, default=0),
                npu_tops=_round(npu_available),
                dla_count=max(0, capacity.dla_count - allocation.dla_count),
                memory_total_gb=_round(
                    capacity.memory_total_gb - allocation.memory_gb
                ),
            )
            advisory = CandidateRuntimeAdvisory(
                cpu_utilization_percent=report.cpu.utilization_percent,
                gpu_utilization_percent=(
                    gpu.utilization_percent if gpu.supported and not gpu.error else None
                ),
                vram_available_gb=(
                    _gib(gpu.available_vram_bytes)
                    if gpu.supported and not gpu.error
                    else None
                ),
                memory_available_gb=_gib(report.memory.available_bytes),
            )

        availability = CandidateResourceAvailability(
            cpu=_state(
                capacity.cpu_cores,
                available.cpu_cores,
                unknown="cpu" in allocation.unknown,
            ),
            gpu=_state(
                capacity.gpu_count,
                available.gpu_count,
                unknown=bool({"gpu_count", "vram"} & allocation.unknown),
            ),
            memory=_state(
                capacity.memory_total_gb,
                available.memory_total_gb,
                unknown="memory" in allocation.unknown,
            ),
            npu=_state(
                capacity.npu_tops,
                available.npu_tops,
                unknown="npu" in allocation.unknown,
            ),
            dla=_state(
                capacity.dla_count,
                available.dla_count,
                unknown="dla" in allocation.unknown,
            ),
        )
        return CandidateNodeSnapshot(
            node_id=node.node_id,
            cluster_id=node.cluster_id,
            hostname=node.identity.hostname,
            architecture=node.identity.architecture,
            labels=list(node.labels),
            runtime_status=node.runtime_status,
            operational_status=node.operational_status,
            health_status=node.health_status,
            schedulable=node.schedulable,
            capacity=capacity,
            available_capacity=available,
            resource_availability=availability,
            runtime_advisory=advisory,
            last_heartbeat_at=node.last_heartbeat_at,
            last_resource_at=node.last_resource_at,
        )

    @staticmethod
    def _single_node_reasons(
        snapshot: CandidateNodeSnapshot,
        requirement: ResourceRequirement,
    ) -> list[CandidateExclusionReason]:
        available = snapshot.available_capacity
        states = snapshot.resource_availability
        reasons: list[CandidateExclusionReason] = []
        if requirement.cpu_cores is not None and available.cpu_cores < requirement.cpu_cores:
            reasons.append(CandidateExclusionReason.CPU_INSUFFICIENT)

        gpu_required = (requirement.gpu_count or 0) > 0 or (
            requirement.min_vram_total_gb or 0
        ) > 0
        effective_gpu_count = requirement.gpu_count or (1 if gpu_required else 0)
        if gpu_required and states.gpu == ResourceAvailabilityState.BUSY:
            reasons.append(CandidateExclusionReason.RESOURCE_BUSY)
        if available.gpu_count < effective_gpu_count:
            reasons.append(CandidateExclusionReason.GPU_INSUFFICIENT)
        if (
            requirement.min_vram_total_gb is not None
            and available.max_gpu_vram_gb < requirement.min_vram_total_gb
        ):
            reasons.append(CandidateExclusionReason.VRAM_INSUFFICIENT)

        if requirement.npu_tops is not None:
            if states.npu == ResourceAvailabilityState.BUSY:
                reasons.append(CandidateExclusionReason.RESOURCE_BUSY)
            if available.npu_tops < requirement.npu_tops:
                reasons.append(CandidateExclusionReason.NPU_INSUFFICIENT)
        if requirement.dla_count is not None:
            if states.dla == ResourceAvailabilityState.BUSY:
                reasons.append(CandidateExclusionReason.RESOURCE_BUSY)
            if available.dla_count < requirement.dla_count:
                reasons.append(CandidateExclusionReason.DLA_INSUFFICIENT)
        if (
            requirement.memory_gb is not None
            and available.memory_total_gb < requirement.memory_gb
        ):
            reasons.append(CandidateExclusionReason.MEMORY_INSUFFICIENT)
        return list(dict.fromkeys(reasons))

    @staticmethod
    def _distributed_contribution(
        snapshot: CandidateNodeSnapshot,
        requirement: ResourceRequirement,
    ) -> tuple[bool, list[CandidateExclusionReason]]:
        available = snapshot.available_capacity
        states = snapshot.resource_availability
        requested: list[tuple[bool, bool, CandidateExclusionReason, bool]] = [
            (
                requirement.cpu_cores is not None,
                available.cpu_cores > 0,
                CandidateExclusionReason.CPU_INSUFFICIENT,
                states.cpu == ResourceAvailabilityState.BUSY,
            ),
            (
                (requirement.gpu_count or 0) > 0
                or (requirement.min_vram_total_gb or 0) > 0,
                available.gpu_count > 0 and available.vram_total_gb > 0,
                CandidateExclusionReason.VRAM_INSUFFICIENT,
                states.gpu == ResourceAvailabilityState.BUSY,
            ),
            (
                requirement.memory_gb is not None,
                available.memory_total_gb > 0,
                CandidateExclusionReason.MEMORY_INSUFFICIENT,
                states.memory == ResourceAvailabilityState.BUSY,
            ),
            (
                requirement.npu_tops is not None,
                available.npu_tops > 0,
                CandidateExclusionReason.NPU_INSUFFICIENT,
                states.npu == ResourceAvailabilityState.BUSY,
            ),
            (
                requirement.dla_count is not None,
                available.dla_count > 0,
                CandidateExclusionReason.DLA_INSUFFICIENT,
                states.dla == ResourceAvailabilityState.BUSY,
            ),
        ]
        relevant = [item for item in requested if item[0]]
        if not relevant or any(item[1] for item in relevant):
            return True, []
        reasons = [item[2] for item in relevant]
        if any(item[3] for item in relevant):
            reasons.append(CandidateExclusionReason.RESOURCE_BUSY)
        return False, list(dict.fromkeys(reasons))

    @staticmethod
    def _aggregate(
        candidates: list[CandidateNodeSnapshot],
    ) -> CandidateAggregateCapacity:
        return CandidateAggregateCapacity(
            cpu_cores=_round(sum(item.available_capacity.cpu_cores for item in candidates)),
            gpu_count=sum(item.available_capacity.gpu_count for item in candidates),
            vram_gb=_round(
                sum(item.available_capacity.vram_total_gb for item in candidates)
            ),
            memory_gb=_round(
                sum(item.available_capacity.memory_total_gb for item in candidates)
            ),
            npu_tops=_round(sum(item.available_capacity.npu_tops for item in candidates)),
            dla_devices=sum(item.available_capacity.dla_count for item in candidates),
        )

    @staticmethod
    def _aggregate_satisfies(
        aggregate: CandidateAggregateCapacity,
        requirement: ResourceRequirement,
    ) -> bool:
        gpu_required = (requirement.gpu_count or 0) > 0 or (
            requirement.min_vram_total_gb or 0
        ) > 0
        return all(
            (
                requirement.cpu_cores is None
                or aggregate.cpu_cores >= requirement.cpu_cores,
                not gpu_required
                or aggregate.gpu_count >= (requirement.gpu_count or 1),
                requirement.min_vram_total_gb is None
                or aggregate.vram_gb >= requirement.min_vram_total_gb,
                requirement.memory_gb is None
                or aggregate.memory_gb >= requirement.memory_gb,
                requirement.npu_tops is None
                or aggregate.npu_tops >= requirement.npu_tops,
                requirement.dla_count is None
                or aggregate.dla_devices >= requirement.dla_count,
            )
        )

    def query_candidates(
        self,
        request: CandidateQueryRequest,
        *,
        now: datetime | None = None,
    ) -> CandidateQueryResponse:
        generated_at = now or datetime.now(timezone.utc)
        stale_before = generated_at - timedelta(
            seconds=self._settings.resource_stale_after_seconds
        )
        requirement = request.requirement
        if request.cluster_scope == ClusterScope.CROSS_CLUSTER_ALLOWED:
            raise CrossClusterExecutionNotSupportedError(
                "cross-cluster distributed execution is not supported"
            )
        required_labels = set(requirement.required_labels)
        allowed_nodes = (
            set(request.allowed_node_ids)
            if request.allowed_node_ids is not None
            else None
        )
        if (
            request.execution_mode == ExecutionMode.DISTRIBUTED
            and request.cluster_scope == ClusterScope.SAME_CLUSTER
            and request.allowed_node_ids is not None
        ):
            allowed_clusters: set[str | None] = set()
            for node_id in request.allowed_node_ids:
                node = self._store.get_node(node_id)
                if node is not None:
                    allowed_clusters.add(node.cluster_id)
            if len(allowed_clusters) > 1:
                raise AllowedNodesCrossClusterError(
                    "allowed_node_ids must belong to a single cluster "
                    "when cluster_scope is SAME_CLUSTER"
                )
        allocations = _allocation_by_node(self._store.list_scheduler_executions())
        candidates: list[CandidateNodeSnapshot] = []
        excluded: list[ExcludedCandidateNode] = []

        for node in sorted(self._store.list_nodes(), key=lambda item: str(item.node_id)):
            snapshot = self._snapshot(
                node, allocations.get(node.node_id, _NodeAllocations())
            )
            reasons: list[CandidateExclusionReason] = []
            if node.registration_status != RegistrationStatus.REGISTERED:
                reasons.append(CandidateExclusionReason.NOT_REGISTERED)
            if (
                not node.ever_approved
                or node.authorization_status != AuthorizationStatus.APPROVED
            ):
                reasons.append(CandidateExclusionReason.NOT_AUTHORIZED)
            if node.pool_membership != PoolMembership.IN_POOL:
                reasons.append(CandidateExclusionReason.NOT_IN_POOL)
            if request.cluster_id is not None and node.cluster_id != request.cluster_id:
                reasons.append(CandidateExclusionReason.NOT_IN_CLUSTER)
            if not node.scheduling_enabled or not node.schedulable:
                reasons.append(CandidateExclusionReason.NOT_SCHEDULABLE)
            if node.runtime_status != RuntimeStatus.ONLINE:
                reasons.append(CandidateExclusionReason.OFFLINE)
            if (
                node.operational_status != NodeOperationalStatus.ONLINE
                or node.health_status != HealthStatus.HEALTHY
            ):
                if node.operational_status == NodeOperationalStatus.OFFLINE:
                    if CandidateExclusionReason.OFFLINE not in reasons:
                        reasons.append(CandidateExclusionReason.OFFLINE)
                else:
                    reasons.append(CandidateExclusionReason.UNHEALTHY)
            if (
                node.resources is None
                or node.last_resource_at is None
                or node.last_resource_at < stale_before
            ):
                reasons.append(CandidateExclusionReason.RESOURCE_STALE)
            if (
                requirement.architecture is not None
                and _canonical_architecture(node.identity.architecture)
                != _canonical_architecture(requirement.architecture)
            ):
                reasons.append(CandidateExclusionReason.ARCHITECTURE_MISMATCH)
            if not required_labels.issubset(set(node.labels)):
                reasons.append(CandidateExclusionReason.LABEL_MISMATCH)
            if allowed_nodes is not None and node.node_id not in allowed_nodes:
                reasons.append(CandidateExclusionReason.NOT_IN_ALLOWED_SET)

            if request.execution_mode == ExecutionMode.SINGLE_NODE:
                reasons.extend(self._single_node_reasons(snapshot, requirement))
            elif not reasons:
                if request.execution_mode == ExecutionMode.DISTRIBUTED:
                    contributes, contribution_reasons = self._distributed_contribution(
                        snapshot, requirement
                    )
                    if not contributes:
                        reasons.extend(contribution_reasons)

            if reasons:
                excluded.append(
                    ExcludedCandidateNode(
                        **snapshot.model_dump(),
                        reasons=list(dict.fromkeys(reasons)),
                    )
                )
            else:
                candidates.append(snapshot)

        aggregate = self._aggregate(candidates)

        # Execution scope is independent from search scope. Group candidates
        # by cluster so a DISTRIBUTED task under SAME_CLUSTER is only judged
        # satisfiable when one cluster's own candidates cover the requirement.
        aggregate_by_cluster: list[ClusterAggregateCapacity] = []
        satisfied_cluster_ids: list[str] = []
        by_cluster: dict[str, list[CandidateNodeSnapshot]] = {}
        for candidate in candidates:
            by_cluster.setdefault(candidate.cluster_id or "", []).append(candidate)
        for cluster_id in sorted(by_cluster):
            members = by_cluster[cluster_id]
            cluster_aggregate = self._aggregate(members)
            cluster_satisfied = self._aggregate_satisfies(
                cluster_aggregate, requirement
            )
            cluster_record = (
                self._store.get_cluster(cluster_id) if cluster_id else None
            )
            cluster_name = (
                cluster_record.cluster_name
                if cluster_record is not None
                else (cluster_id or "未归属集群")
            )
            aggregate_by_cluster.append(
                ClusterAggregateCapacity(
                    cluster_id=cluster_id,
                    cluster_name=cluster_name,
                    node_count=len(members),
                    aggregate_capacity=cluster_aggregate,
                    requirement_satisfied=cluster_satisfied,
                )
            )
            if cluster_satisfied and cluster_id:
                satisfied_cluster_ids.append(cluster_id)

        if request.execution_mode == ExecutionMode.SINGLE_NODE:
            requirement_satisfied = bool(candidates)
        else:
            # DISTRIBUTED + SAME_CLUSTER (CROSS_CLUSTER_ALLOWED was rejected
            # above). Satisfiable only when one cluster group covers it.
            requirement_satisfied = any(
                group.requirement_satisfied for group in aggregate_by_cluster
            )

        return CandidateQueryResponse(
            request_id=request.request_id,
            task_id=request.task_id,
            snapshot_id=f"pool-snapshot-{uuid4()}",
            generated_at=generated_at,
            cluster_id=request.cluster_id,
            execution_mode=request.execution_mode,
            candidates=candidates,
            excluded_nodes=excluded,
            aggregate_capacity=aggregate,
            requirement_satisfied=requirement_satisfied,
            aggregate_by_cluster=aggregate_by_cluster,
            satisfied_cluster_ids=satisfied_cluster_ids,
        )

