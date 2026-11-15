from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from ..models.scheduler_execution import (
    SchedulerEventResponse,
    SchedulerExecutionEvent,
    SchedulerExecutionListResponse,
    SchedulerExecutionProjection,
    SchedulerExecutionSnapshotRequest,
    SchedulerExecutionSnapshotResponse,
)
from ..stores.base import NodeStore


class PhysicalNodeNotFoundError(LookupError):
    pass


class SchedulerSyncService:
    """Persist a read-only projection of the external Scheduler's authority."""

    def __init__(self, store: NodeStore) -> None:
        self._store = store

    def record_event(self, event: SchedulerExecutionEvent) -> SchedulerEventResponse:
        if not self._store.has_scheduler_event(event.event_id):
            self._require_physical_node(event.physical_node_id)
        disposition, projection = self._store.apply_scheduler_execution_event(event)
        return SchedulerEventResponse(
            disposition=disposition,
            projection=projection,
        )

    def synchronize_snapshot(
        self, request: SchedulerExecutionSnapshotRequest
    ) -> SchedulerExecutionSnapshotResponse:
        for item in request.executions:
            self._require_physical_node(item.physical_node_id)
        synchronized_at = datetime.now(timezone.utc)
        projections = [
            SchedulerExecutionProjection(
                **item.model_dump(),
                last_event_id=None,
                updated_at=synchronized_at,
            )
            for item in request.executions
        ]
        self._store.replace_scheduler_executions(projections)
        return SchedulerExecutionSnapshotResponse(
            snapshot_id=request.snapshot_id,
            generated_at=request.generated_at,
            synchronized_at=synchronized_at,
            execution_count=len(projections),
        )

    def list_executions(
        self,
        *,
        physical_node_id: UUID | None = None,
        task_id: str | None = None,
        active_only: bool = False,
    ) -> SchedulerExecutionListResponse:
        items = self._store.list_scheduler_executions()
        if physical_node_id is not None:
            items = [item for item in items if item.physical_node_id == physical_node_id]
        if task_id is not None:
            items = [item for item in items if item.task_id == task_id]
        if active_only:
            from ..models.scheduler_execution import NON_TERMINAL_STATUSES

            items = [item for item in items if item.status in NON_TERMINAL_STATUSES]
        items.sort(key=lambda item: item.occurred_at, reverse=True)
        return SchedulerExecutionListResponse(
            items=items,
            total=len(items),
            updated_at=datetime.now(timezone.utc),
        )

    def _require_physical_node(self, node_id: UUID) -> None:
        if self._store.get_node(node_id) is None:
            raise PhysicalNodeNotFoundError(
                f"physical node {node_id} does not exist in the Resource Pool"
            )

