from __future__ import annotations

from datetime import datetime, timezone
from threading import RLock
from uuid import UUID

from ..models.cluster import (
    ClusterCreateRequest,
    ClusterRecord,
    ClusterStatus,
    ClusterUpdateRequest,
    ClusterView,
)
from ..models.node import (
    AuthorizationStatus,
    ClusterRef,
    NodeEvent,
    NodeOperationalStatus,
    NodeRecord,
    PoolMembership,
    RegistrationStatus,
    RuntimeStatus,
)
from ..stores.base import ClusterConflictError, NodeStore
from .node_service import NodeNotFoundError
from .resource_aggregation import ResourceAggregationService


class ClusterNotFoundError(LookupError):
    pass


class ClusterAlreadyExistsError(ValueError):
    pass


class ClusterNotEmptyError(ValueError):
    code = "CLUSTER_NOT_EMPTY"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ClusterService:
    def __init__(
        self,
        store: NodeStore,
        resource_aggregation: ResourceAggregationService,
    ) -> None:
        self._store = store
        self._resource_aggregation = resource_aggregation
        self._operation_lock = RLock()

    def create_cluster(self, request: ClusterCreateRequest) -> ClusterView:
        with self._operation_lock:
            cluster_id = request.resolved_cluster_id()
            if self._store.get_cluster(cluster_id) is not None:
                raise ClusterAlreadyExistsError(
                    f"cluster {cluster_id} already exists"
                )
            now = utc_now()
            cluster = ClusterRecord(
                cluster_id=cluster_id,
                cluster_name=request.cluster_name,
                version=request.version,
                status=ClusterStatus.UNKNOWN,
                enterprise=request.enterprise,
                project=request.project,
                management_endpoint=request.management_endpoint,
                created_at=now,
                updated_at=now,
            )
            members = [self._require_node(node_id) for node_id in request.node_ids]
            for node in members:
                self._require_assignable(node)
                node.cluster_id = cluster.cluster_id
                node.cluster = ClusterRef(
                    id=cluster.cluster_id, name=cluster.cluster_name
                )
            try:
                saved = self._store.create_cluster_with_nodes(cluster, members)
            except ClusterConflictError as exc:
                if self._store.get_cluster(cluster_id) is not None:
                    raise ClusterAlreadyExistsError(str(exc)) from exc
                raise
            for member in members:
                self._event(
                    member,
                    "NODE_ASSIGNED_CLUSTER",
                    f"节点已加入集群 {cluster.cluster_name}",
                )
            return self._view(saved, members)

    def list_clusters(self) -> list[ClusterView]:
        return [
            self._view(cluster, self._store.list_nodes_by_cluster_id(cluster.cluster_id))
            for cluster in self._store.list_clusters()
        ]

    def get_cluster(self, cluster_id: str) -> ClusterView:
        cluster = self._require_cluster(cluster_id)
        return self._view(
            cluster, self._store.list_nodes_by_cluster_id(cluster.cluster_id)
        )

    def update_cluster(
        self, cluster_id: str, request: ClusterUpdateRequest
    ) -> ClusterView:
        with self._operation_lock:
            cluster = self._require_cluster(cluster_id)
            changes = request.model_dump(exclude_unset=True)
            old_name = cluster.cluster_name
            for field, value in changes.items():
                setattr(cluster, field, value)
            cluster.updated_at = utc_now()
            try:
                saved = self._store.update_cluster(cluster)
            except KeyError as exc:
                raise ClusterNotFoundError(
                    f"cluster {cluster_id} was not found"
                ) from exc

            members = self._store.list_nodes_by_cluster_id(cluster_id)
            if old_name != saved.cluster_name:
                for node in members:
                    node.cluster = ClusterRef(
                        id=saved.cluster_id, name=saved.cluster_name
                    )
                    node.cluster_id = saved.cluster_id
                    self._store.save_node(node)
            return self._view(saved, members)

    def delete_cluster(self, cluster_id: str) -> None:
        with self._operation_lock:
            self._require_cluster(cluster_id)
            if self._store.list_nodes_by_cluster_id(cluster_id):
                raise ClusterNotEmptyError(
                    f"CLUSTER_NOT_EMPTY: cluster {cluster_id} still has members"
                )
            if not self._store.delete_cluster(cluster_id):
                raise ClusterNotFoundError(f"cluster {cluster_id} was not found")

    def list_nodes(self, cluster_id: str) -> list[NodeRecord]:
        self._require_cluster(cluster_id)
        return sorted(
            self._store.list_nodes_by_cluster_id(cluster_id),
            key=lambda node: (node.node_name.casefold(), str(node.node_id)),
        )

    def assign_node(self, cluster_id: str, node_id: UUID) -> NodeRecord:
        with self._operation_lock:
            cluster = self._require_cluster(cluster_id)
            node = self._require_node(node_id)
            if node.cluster_id == cluster_id:
                return node
            if node.cluster_id is not None:
                raise ClusterConflictError(
                    f"NODE_ALREADY_ASSIGNED: node {node_id} already belongs "
                    f"to cluster {node.cluster_id}; use move_node"
                )
            self._require_assignable(node)

            node.cluster_id = cluster.cluster_id
            node.cluster = ClusterRef(
                id=cluster.cluster_id, name=cluster.cluster_name
            )
            saved = self._store.save_node(node)

            self._event(
                saved,
                "NODE_ASSIGNED_CLUSTER",
                f"节点已加入集群 {cluster.cluster_name}",
            )
            return saved

    def unassign_node(self, node_id: UUID, expected_cluster_id: str | None = None) -> NodeRecord:
        with self._operation_lock:
            node = self._require_node(node_id)
            if expected_cluster_id is not None:
                self._require_cluster(expected_cluster_id)
                if node.cluster_id != expected_cluster_id:
                    raise ClusterConflictError(
                        f"node {node_id} is not a member of cluster {expected_cluster_id}"
                    )
            if node.cluster_id is None:
                return node

            previous_name = node.cluster.name if node.cluster else node.cluster_id
            node.cluster_id = None
            node.cluster = None
            saved = self._store.save_node(node)
            self._event(
                saved,
                "NODE_UNASSIGNED_CLUSTER",
                f"节点已移出集群 {previous_name}",
            )
            return saved

    def move_node(self, node_id: UUID, target_cluster_id: str) -> NodeRecord:
        with self._operation_lock:
            target = self._require_cluster(target_cluster_id)
            node = self._require_node(node_id)
            if node.cluster_id == target_cluster_id:
                return node
            if node.cluster_id is None:
                return self.assign_node(target_cluster_id, node_id)

            previous_cluster_id = node.cluster_id
            previous_cluster_name = node.cluster.name if node.cluster else None
            node.cluster_id = target.cluster_id
            node.cluster = ClusterRef(id=target.cluster_id, name=target.cluster_name)
            saved = self._store.save_node(node)
            self._event(
                saved,
                "NODE_MOVED_CLUSTER",
                "节点已从集群 "
                f"{previous_cluster_name or previous_cluster_id} "
                f"迁移到 {target.cluster_name}",
            )
            return saved

    def _require_cluster(self, cluster_id: str) -> ClusterRecord:
        cluster = self._store.get_cluster(cluster_id)
        if cluster is None:
            raise ClusterNotFoundError(f"cluster {cluster_id} was not found")
        return cluster

    def _require_node(self, node_id: UUID) -> NodeRecord:
        node = self._store.get_node(node_id)
        if node is None:
            raise NodeNotFoundError(f"node {node_id} was not found")
        return node

    @staticmethod
    def _require_assignable(node: NodeRecord) -> None:
        if node.cluster_id is not None:
            raise ClusterConflictError(
                f"NODE_ALREADY_ASSIGNED: node {node.node_id} already belongs "
                f"to cluster {node.cluster_id}"
            )
        if not (
            node.registration_status == RegistrationStatus.REGISTERED
            and node.ever_approved
            and node.authorization_status == AuthorizationStatus.APPROVED
            and node.pool_membership == PoolMembership.IN_POOL
            and node.runtime_status == RuntimeStatus.ONLINE
        ):
            raise ClusterConflictError(
                "NODE_NOT_ELIGIBLE: node "
                f"{node.node_id} must be registered, approved, in the resource "
                "pool, online, and currently unassigned"
            )

    def _view(self, cluster: ClusterRecord, members: list[NodeRecord]) -> ClusterView:
        return ClusterView.model_validate(
            {
                **cluster.model_dump(),
                "status": self._derive_status(members),
                "node_count": len(members),
                "resource_summary": self._resource_aggregation.get_cluster_summary(
                    cluster.cluster_id
                ),
            }
        )

    @staticmethod
    def _derive_status(members: list[NodeRecord]) -> ClusterStatus:
        if not members:
            return ClusterStatus.UNKNOWN
        statuses = [member.operational_status for member in members]
        if all(status == NodeOperationalStatus.OFFLINE for status in statuses):
            return ClusterStatus.OFFLINE
        if all(status == NodeOperationalStatus.ONLINE for status in statuses):
            return ClusterStatus.ONLINE
        return ClusterStatus.DEGRADED

    def _event(self, node: NodeRecord, event_type: str, message: str) -> None:
        self._store.add_event(
            NodeEvent(
                node_id=node.node_id,
                node_name=node.node_name,
                event_type=event_type,
                level="INFO",
                message=message,
                occurred_at=utc_now(),
            )
        )
