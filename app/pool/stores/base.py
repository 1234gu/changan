from __future__ import annotations

from typing import Protocol
from uuid import UUID

from ..models.cluster import ClusterRecord
from ..models.heartbeat import NodeHeartbeatRecord
from ..models.node import NodeEvent, NodeRecord, NodeRegistrationRecord
from ..models.scheduler_execution import (
    SchedulerEventDisposition,
    SchedulerExecutionEvent,
    SchedulerExecutionProjection,
)


class DeviceFingerprintConflictError(ValueError):
    """A non-null fingerprint is already owned by another node row."""


class ClusterConflictError(ValueError):
    """A cluster row violates a uniqueness or integrity constraint."""


class NodeStore(Protocol):
    """Persistence boundary for nodes and their audit history."""

    def get_node(self, node_id: UUID) -> NodeRecord | None: ...

    def get_node_by_device_fingerprint(
        self, device_fingerprint: str
    ) -> NodeRecord | None: ...

    def save_node(self, node: NodeRecord) -> NodeRecord: ...

    def list_nodes(self) -> list[NodeRecord]: ...

    def list_nodes_by_cluster_id(self, cluster_id: str) -> list[NodeRecord]: ...

    def delete_node(self, node_id: UUID) -> bool: ...

    def add_event(self, event: NodeEvent) -> NodeEvent: ...

    def list_events(self, node_id: UUID | None = None) -> list[NodeEvent]: ...

    def add_registration(
        self, record: NodeRegistrationRecord
    ) -> NodeRegistrationRecord: ...

    def save_registration(
        self, record: NodeRegistrationRecord
    ) -> NodeRegistrationRecord: ...

    def list_registrations(
        self, node_id: UUID | None = None
    ) -> list[NodeRegistrationRecord]: ...

    def add_heartbeat(self, record: NodeHeartbeatRecord) -> NodeHeartbeatRecord: ...

    def list_heartbeats(self, node_id: UUID) -> list[NodeHeartbeatRecord]: ...

    def create_cluster(self, cluster: ClusterRecord) -> ClusterRecord: ...

    def create_cluster_with_nodes(
        self, cluster: ClusterRecord, nodes: list[NodeRecord]
    ) -> ClusterRecord: ...

    def get_cluster(self, cluster_id: str) -> ClusterRecord | None: ...

    def list_clusters(self) -> list[ClusterRecord]: ...

    def update_cluster(self, cluster: ClusterRecord) -> ClusterRecord: ...

    def delete_cluster(self, cluster_id: str) -> bool: ...

    def has_scheduler_event(self, event_id: str) -> bool: ...

    def apply_scheduler_execution_event(
        self, event: SchedulerExecutionEvent
    ) -> tuple[SchedulerEventDisposition, SchedulerExecutionProjection | None]: ...

    def list_scheduler_executions(self) -> list[SchedulerExecutionProjection]: ...

    def replace_scheduler_executions(
        self, executions: list[SchedulerExecutionProjection]
    ) -> None: ...

    def close(self) -> None: ...
