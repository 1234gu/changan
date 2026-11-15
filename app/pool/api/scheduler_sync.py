from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from ..models.scheduler_execution import (
    SchedulerEventResponse,
    SchedulerExecutionEvent,
    SchedulerExecutionListResponse,
    SchedulerExecutionSnapshotRequest,
    SchedulerExecutionSnapshotResponse,
)
from ..services.scheduler_sync_service import (
    PhysicalNodeNotFoundError,
    SchedulerSyncService,
)

router = APIRouter(prefix="/api/v1/scheduler", tags=["scheduler-sync"])


def get_scheduler_sync_service(request: Request) -> SchedulerSyncService:
    return request.app.state.scheduler_sync_service


SchedulerSyncDependency = Annotated[
    SchedulerSyncService, Depends(get_scheduler_sync_service)
]


def _physical_node_not_found(exc: PhysicalNodeNotFoundError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "PHYSICAL_NODE_NOT_FOUND", "message": str(exc)},
    )


@router.post("/execution-events", response_model=SchedulerEventResponse)
def receive_execution_event(
    payload: SchedulerExecutionEvent,
    service: SchedulerSyncDependency,
) -> SchedulerEventResponse:
    try:
        return service.record_event(payload)
    except PhysicalNodeNotFoundError as exc:
        raise _physical_node_not_found(exc) from exc


@router.put(
    "/executions/snapshot",
    response_model=SchedulerExecutionSnapshotResponse,
)
def synchronize_execution_snapshot(
    payload: SchedulerExecutionSnapshotRequest,
    service: SchedulerSyncDependency,
) -> SchedulerExecutionSnapshotResponse:
    try:
        return service.synchronize_snapshot(payload)
    except PhysicalNodeNotFoundError as exc:
        raise _physical_node_not_found(exc) from exc


@router.get("/executions", response_model=SchedulerExecutionListResponse)
def list_execution_projections(
    service: SchedulerSyncDependency,
    physical_node_id: UUID | None = Query(default=None),
    task_id: str | None = Query(default=None, min_length=1, max_length=255),
    active_only: bool = Query(default=False),
) -> SchedulerExecutionListResponse:
    return service.list_executions(
        physical_node_id=physical_node_id,
        task_id=task_id,
        active_only=active_only,
    )

