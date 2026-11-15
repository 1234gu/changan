from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import Field, field_validator

from .node import (
    ApiModel,
    HealthStatus,
    NodeOperationalStatus,
    RuntimeStatus,
)


class ResourceRequirement(ApiModel):
    """Hard-capacity constraints understood by the Resource Pool.

    Runtime queue depth, bandwidth and utilization deliberately do not belong
    here: the external Scheduler remains responsible for final shard placement.
    """

    cpu_cores: int | None = Field(default=None, ge=0)
    gpu_count: int | None = Field(default=None, ge=0)
    min_vram_total_gb: float | None = Field(default=None, ge=0)
    npu_tops: float | None = Field(default=None, ge=0)
    dla_count: int | None = Field(default=None, ge=0)
    memory_gb: float | None = Field(default=None, ge=0)
    architecture: str | None = Field(default=None, min_length=1, max_length=64)
    required_labels: list[str] = Field(default_factory=list, max_length=100)

    @field_validator("architecture")
    @classmethod
    def normalize_architecture(cls, value: str | None) -> str | None:
        return value.strip().lower() if value is not None else None

    @field_validator("required_labels")
    @classmethod
    def normalize_labels(cls, values: list[str]) -> list[str]:
        return list(dict.fromkeys(value.strip() for value in values if value.strip()))


class ExecutionMode(StrEnum):
    SINGLE_NODE = "SINGLE_NODE"
    DISTRIBUTED = "DISTRIBUTED"


class ClusterScope(StrEnum):
    """Execution scope for DISTRIBUTED tasks.

    ``SAME_CLUSTER`` is the only supported value in this iteration: a
    DISTRIBUTED task may combine nodes from one cluster only.
    ``CROSS_CLUSTER_ALLOWED`` is reserved at the protocol layer and is not
    yet executable.
    """

    SAME_CLUSTER = "SAME_CLUSTER"
    CROSS_CLUSTER_ALLOWED = "CROSS_CLUSTER_ALLOWED"


class CandidateQueryRequest(ApiModel):
    request_id: str = Field(min_length=1, max_length=255)
    task_id: str = Field(min_length=1, max_length=255)
    cluster_id: str | None = Field(default=None, min_length=1, max_length=255)
    execution_mode: ExecutionMode = ExecutionMode.SINGLE_NODE
    cluster_scope: ClusterScope = ClusterScope.SAME_CLUSTER
    requirement: ResourceRequirement = Field(default_factory=ResourceRequirement)
    allowed_node_ids: list[UUID] | None = None

    @field_validator("allowed_node_ids")
    @classmethod
    def unique_allowed_nodes(cls, values: list[UUID] | None) -> list[UUID] | None:
        return list(dict.fromkeys(values)) if values is not None else None


class CandidateCapacity(ApiModel):
    cpu_cores: int = Field(ge=0)
    gpu_count: int = Field(ge=0)
    vram_total_gb: float = Field(ge=0)
    max_gpu_vram_gb: float = Field(default=0, ge=0)
    npu_tops: float = Field(ge=0)
    dla_count: int = Field(ge=0)
    memory_total_gb: float = Field(ge=0)


class ResourceAvailabilityState(StrEnum):
    FREE = "FREE"
    PARTIAL = "PARTIAL"
    BUSY = "BUSY"
    UNKNOWN = "UNKNOWN"
    NOT_PRESENT = "NOT_PRESENT"


class CandidateResourceAvailability(ApiModel):
    cpu: ResourceAvailabilityState
    gpu: ResourceAvailabilityState
    memory: ResourceAvailabilityState
    npu: ResourceAvailabilityState
    dla: ResourceAvailabilityState


class CandidateAggregateCapacity(ApiModel):
    cpu_cores: float = Field(ge=0)
    gpu_count: int = Field(ge=0)
    vram_gb: float = Field(ge=0)
    memory_gb: float = Field(ge=0)
    npu_tops: float = Field(ge=0)
    dla_devices: int = Field(ge=0)


class ClusterAggregateCapacity(ApiModel):
    """Aggregate candidate capacity scoped to one cluster.

    This is the execution-scope view: under ``SAME_CLUSTER`` a DISTRIBUTED
    task is satisfiable only when one of these groups independently meets the
    full requirement. It must not be confused with the global
    ``aggregate_capacity`` statistic, which merely describes the search scope.
    """

    cluster_id: str
    cluster_name: str
    node_count: int = Field(ge=0)
    aggregate_capacity: CandidateAggregateCapacity
    requirement_satisfied: bool


class CandidateRuntimeAdvisory(ApiModel):
    cpu_utilization_percent: float | None = Field(default=None, ge=0, le=100)
    gpu_utilization_percent: float | None = Field(default=None, ge=0, le=100)
    vram_available_gb: float | None = Field(default=None, ge=0)
    memory_available_gb: float | None = Field(default=None, ge=0)


class CandidateNodeSnapshot(ApiModel):
    node_id: UUID
    cluster_id: str | None = None
    hostname: str
    architecture: str
    labels: list[str]
    runtime_status: RuntimeStatus
    operational_status: NodeOperationalStatus
    health_status: HealthStatus
    schedulable: bool
    capacity: CandidateCapacity
    available_capacity: CandidateCapacity
    resource_availability: CandidateResourceAvailability
    runtime_advisory: CandidateRuntimeAdvisory
    last_heartbeat_at: datetime | None = None
    last_resource_at: datetime | None = None


class CandidateExclusionReason(StrEnum):
    NOT_REGISTERED = "NOT_REGISTERED"
    NOT_AUTHORIZED = "NOT_AUTHORIZED"
    NOT_IN_POOL = "NOT_IN_POOL"
    NOT_IN_CLUSTER = "NOT_IN_CLUSTER"
    NOT_SCHEDULABLE = "NOT_SCHEDULABLE"
    OFFLINE = "OFFLINE"
    UNHEALTHY = "UNHEALTHY"
    RESOURCE_STALE = "RESOURCE_STALE"
    ARCHITECTURE_MISMATCH = "ARCHITECTURE_MISMATCH"
    LABEL_MISMATCH = "LABEL_MISMATCH"
    CPU_INSUFFICIENT = "CPU_INSUFFICIENT"
    GPU_INSUFFICIENT = "GPU_INSUFFICIENT"
    VRAM_INSUFFICIENT = "VRAM_INSUFFICIENT"
    NPU_INSUFFICIENT = "NPU_INSUFFICIENT"
    DLA_INSUFFICIENT = "DLA_INSUFFICIENT"
    MEMORY_INSUFFICIENT = "MEMORY_INSUFFICIENT"
    NOT_IN_ALLOWED_SET = "NOT_IN_ALLOWED_SET"
    RESOURCE_BUSY = "RESOURCE_BUSY"


class ExcludedCandidateNode(CandidateNodeSnapshot):
    reasons: list[CandidateExclusionReason] = Field(min_length=1)


class CandidateQueryResponse(ApiModel):
    request_id: str
    task_id: str
    snapshot_id: str
    generated_at: datetime
    cluster_id: str | None = None
    execution_mode: ExecutionMode
    candidates: list[CandidateNodeSnapshot]
    excluded_nodes: list[ExcludedCandidateNode]
    aggregate_capacity: CandidateAggregateCapacity
    requirement_satisfied: bool
    aggregate_by_cluster: list[ClusterAggregateCapacity] = Field(default_factory=list)
    satisfied_cluster_ids: list[str] = Field(default_factory=list)

