from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import Field

from .node import ApiModel


class CollectionStatus(StrEnum):
    COMPLETE = "complete"
    PARTIAL = "partial"
    ERROR = "error"


class ResourceMetric(ApiModel):
    total: float = Field(ge=0)
    # Runtime consumption is intentionally separate from scheduler allocation.
    # The latter remains zero until task reservation accounting is connected.
    used: float = Field(default=0, ge=0)
    allocated: float = Field(ge=0)
    available: float = Field(ge=0)
    schedulable_available: float = Field(ge=0)
    unavailable: float = Field(ge=0)
    utilization_percent: float = Field(ge=0, le=100)
    runtime_utilization_percent: float = Field(ge=0, le=100)
    unit: Literal["Core", "GPU", "TOPS", "Device", "GB"]
    collection_status: CollectionStatus = CollectionStatus.COMPLETE
    issue_node_count: int = Field(default=0, ge=0)


class ComputeResourceMetricMap(ApiModel):
    cpu: ResourceMetric
    gpu: ResourceMetric
    npu: ResourceMetric
    dla: ResourceMetric


class ComputePoolSummary(ApiModel):
    resources: ComputeResourceMetricMap
    video_memory: ResourceMetric
    updated_at: datetime


class ClusterResourceSummary(ComputePoolSummary):
    memory: ResourceMetric
    storage: ResourceMetric
