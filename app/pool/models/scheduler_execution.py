from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from uuid import UUID

from pydantic import Field, model_validator

from .node import ApiModel


class SchedulerExecutionStatus(StrEnum):
    QUEUED = "QUEUED"
    ASSIGNED = "ASSIGNED"
    STARTING = "STARTING"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    LOST = "LOST"


ACTIVE_ALLOCATION_STATUSES = frozenset(
    {
        SchedulerExecutionStatus.ASSIGNED,
        SchedulerExecutionStatus.STARTING,
        SchedulerExecutionStatus.RUNNING,
    }
)

NON_TERMINAL_STATUSES = frozenset(
    {SchedulerExecutionStatus.QUEUED, *ACTIVE_ALLOCATION_STATUSES}
)


class K3sExecutionReference(ApiModel):
    cluster_id: str | None = Field(default=None, max_length=255)
    namespace: str | None = Field(default=None, max_length=255)
    job_name: str | None = Field(default=None, max_length=255)
    pod_uid: str | None = Field(default=None, max_length=255)
    container_id: str | None = Field(default=None, max_length=255)


class AllocatedResources(ApiModel):
    cpu_cores: float | None = Field(default=None, ge=0)
    gpu_count: int | None = Field(default=None, ge=0)
    vram_gb: float | None = Field(default=None, ge=0)
    memory_gb: float | None = Field(default=None, ge=0)
    npu_tops: float | None = Field(default=None, ge=0)
    dla_count: int | None = Field(default=None, ge=0)


class SchedulerExecutionBase(ApiModel):
    event_version: int = Field(ge=0)
    task_id: str = Field(min_length=1, max_length=255)
    shard_id: str | None = Field(default=None, max_length=255)
    attempt_id: str = Field(min_length=1, max_length=255)
    physical_node_id: UUID
    executor_id: str | None = Field(default=None, max_length=255)
    k3s: K3sExecutionReference | None = None
    status: SchedulerExecutionStatus
    allocated_resources: AllocatedResources | None = None
    queue_length: int | None = Field(default=None, ge=0)
    occurred_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error: str | None = Field(default=None, max_length=4000)


class SchedulerExecutionEvent(SchedulerExecutionBase):
    event_id: str = Field(min_length=1, max_length=255)


class SchedulerExecutionProjection(SchedulerExecutionBase):
    last_event_id: str | None = Field(default=None, max_length=255)
    updated_at: datetime

    @classmethod
    def from_event(
        cls,
        event: "SchedulerExecutionEvent",
        *,
        updated_at: datetime | None = None,
    ) -> "SchedulerExecutionProjection":
        payload = event.model_dump(exclude={"event_id"})
        return cls(
            **payload,
            last_event_id=event.event_id,
            updated_at=updated_at or datetime.now(timezone.utc),
        )


class SchedulerEventDisposition(StrEnum):
    APPLIED = "APPLIED"
    DUPLICATE_EVENT = "DUPLICATE_EVENT"
    STALE_VERSION = "STALE_VERSION"


class SchedulerEventResponse(ApiModel):
    disposition: SchedulerEventDisposition
    projection: SchedulerExecutionProjection | None = None


class SchedulerExecutionSnapshotItem(SchedulerExecutionBase):
    pass


class SchedulerExecutionSnapshotRequest(ApiModel):
    snapshot_id: str = Field(min_length=1, max_length=255)
    generated_at: datetime
    executions: list[SchedulerExecutionSnapshotItem] = Field(default_factory=list)

    @model_validator(mode="after")
    def attempts_are_unique(self) -> "SchedulerExecutionSnapshotRequest":
        attempts = [item.attempt_id for item in self.executions]
        if len(attempts) != len(set(attempts)):
            raise ValueError("snapshot executions must contain unique attempt_id values")
        return self


class SchedulerExecutionSnapshotResponse(ApiModel):
    snapshot_id: str
    generated_at: datetime
    synchronized_at: datetime
    execution_count: int = Field(ge=0)


class SchedulerExecutionListResponse(ApiModel):
    items: list[SchedulerExecutionProjection]
    total: int = Field(ge=0)
    updated_at: datetime

