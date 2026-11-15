from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status

from ..models.heartbeat import NodeHeartbeatRecord
from ..models.node import (
    HeartbeatRequest,
    ManualConnectRequest,
    NodeActionRequest,
    NodeEvent,
    NodeLabelsRequest,
    NodeListResponse,
    NodeRecord,
    NodeReconnectResponse,
    NodeRegistrationResponse,
    NodeRegistrationRecord,
    RegisterRequest,
    ResourceReportRequest,
)
from ..services.node_service import (
    InvalidNodeTransitionError,
    ManualConnectError,
    NodeNotFoundError,
    NodeService,
    utc_now,
)

router = APIRouter(prefix="/api/v1/nodes", tags=["nodes"])


def get_node_service(request: Request) -> NodeService:
    return request.app.state.node_service


NodeServiceDependency = Annotated[NodeService, Depends(get_node_service)]


def _translate_error(exc: Exception) -> HTTPException:
    if isinstance(exc, NodeNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if isinstance(exc, InvalidNodeTransitionError):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    if isinstance(exc, ManualConnectError):
        return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="unexpected error"
    )


@router.post(
    "/register",
    response_model=NodeRegistrationResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_node(
    payload: RegisterRequest, service: NodeServiceDependency
) -> NodeRegistrationResponse:
    try:
        return service.register(payload)
    except InvalidNodeTransitionError as exc:
        raise _translate_error(exc) from exc


@router.get("/pending", response_model=NodeListResponse)
def list_pending_nodes(service: NodeServiceDependency) -> NodeListResponse:
    items = service.list_pending()
    return NodeListResponse(items=items, total=len(items), updated_at=utc_now())


@router.get("/registrations", response_model=list[NodeRegistrationRecord])
def list_registration_records(
    service: NodeServiceDependency,
    node_id: UUID | None = Query(default=None),
) -> list[NodeRegistrationRecord]:
    return service.list_registrations(node_id)


@router.get("/events", response_model=list[NodeEvent])
def list_node_events(
    service: NodeServiceDependency,
    node_id: UUID | None = Query(default=None),
) -> list[NodeEvent]:
    return service.list_events(node_id)


@router.get("/{node_id}/heartbeats", response_model=list[NodeHeartbeatRecord])
def list_node_heartbeats(
    node_id: UUID,
    service: NodeServiceDependency,
) -> list[NodeHeartbeatRecord]:
    try:
        return service.list_heartbeats(node_id)
    except NodeNotFoundError as exc:
        raise _translate_error(exc) from exc


@router.post(
    "/manual-connect", response_model=NodeRecord, status_code=status.HTTP_201_CREATED
)
async def manual_connect(
    payload: ManualConnectRequest, service: NodeServiceDependency
) -> NodeRecord:
    try:
        return await service.manual_connect(payload)
    except (ManualConnectError, InvalidNodeTransitionError) as exc:
        raise _translate_error(exc) from exc


@router.get("", response_model=NodeListResponse)
def list_nodes(
    service: NodeServiceDependency,
    include_removed: bool = Query(default=True),
) -> NodeListResponse:
    items = service.list_nodes(include_removed=include_removed)
    return NodeListResponse(items=items, total=len(items), updated_at=utc_now())


@router.post("/{node_id}/heartbeat", response_model=NodeRecord)
def heartbeat(
    node_id: UUID,
    payload: HeartbeatRequest,
    service: NodeServiceDependency,
) -> NodeRecord:
    try:
        return service.heartbeat(node_id, payload)
    except NodeNotFoundError as exc:
        raise _translate_error(exc) from exc


@router.post("/{node_id}/resources", response_model=NodeRecord)
def report_resources(
    node_id: UUID,
    payload: ResourceReportRequest,
    service: NodeServiceDependency,
) -> NodeRecord:
    try:
        return service.report_resources(node_id, payload)
    except NodeNotFoundError as exc:
        raise _translate_error(exc) from exc


@router.post("/{node_id}/approve", response_model=NodeRecord)
def approve_node(node_id: UUID, service: NodeServiceDependency) -> NodeRecord:
    try:
        return service.approve(node_id)
    except (NodeNotFoundError, InvalidNodeTransitionError) as exc:
        raise _translate_error(exc) from exc


@router.post("/{node_id}/reject", response_model=NodeRecord)
def reject_node(
    node_id: UUID,
    payload: NodeActionRequest,
    service: NodeServiceDependency,
) -> NodeRecord:
    try:
        return service.reject(node_id, payload.reason)
    except (NodeNotFoundError, InvalidNodeTransitionError) as exc:
        raise _translate_error(exc) from exc


@router.post("/{node_id}/disable-scheduling", response_model=NodeRecord)
def disable_scheduling(
    node_id: UUID,
    payload: NodeActionRequest,
    service: NodeServiceDependency,
) -> NodeRecord:
    try:
        return service.disable_scheduling(node_id, payload.reason)
    except (NodeNotFoundError, InvalidNodeTransitionError) as exc:
        raise _translate_error(exc) from exc


@router.post("/{node_id}/enable-scheduling", response_model=NodeRecord)
def enable_scheduling(
    node_id: UUID,
    payload: NodeActionRequest,
    service: NodeServiceDependency,
) -> NodeRecord:
    try:
        return service.enable_scheduling(node_id, payload.reason)
    except (NodeNotFoundError, InvalidNodeTransitionError) as exc:
        raise _translate_error(exc) from exc


@router.post("/{node_id}/retry-registration", response_model=NodeRecord)
def retry_registration(node_id: UUID, service: NodeServiceDependency) -> NodeRecord:
    try:
        return service.retry_registration(node_id)
    except (NodeNotFoundError, InvalidNodeTransitionError) as exc:
        raise _translate_error(exc) from exc


@router.post("/{node_id}/remove", response_model=NodeRecord)
def remove_node(
    node_id: UUID,
    payload: NodeActionRequest,
    service: NodeServiceDependency,
) -> NodeRecord:
    try:
        return service.remove(node_id, payload.reason)
    except (NodeNotFoundError, InvalidNodeTransitionError) as exc:
        raise _translate_error(exc) from exc


@router.post("/{node_id}/pool/join", response_model=NodeRecord)
def join_node_pool(node_id: UUID, service: NodeServiceDependency) -> NodeRecord:
    try:
        return service.join_pool(node_id)
    except (NodeNotFoundError, InvalidNodeTransitionError) as exc:
        raise _translate_error(exc) from exc


@router.post("/{node_id}/pool/remove", response_model=NodeRecord)
def remove_node_from_pool(
    node_id: UUID,
    payload: NodeActionRequest,
    service: NodeServiceDependency,
) -> NodeRecord:
    try:
        return service.remove(node_id, payload.reason)
    except (NodeNotFoundError, InvalidNodeTransitionError) as exc:
        raise _translate_error(exc) from exc


@router.post("/{node_id}/labels", response_model=NodeRecord)
def update_node_labels(
    node_id: UUID,
    payload: NodeLabelsRequest,
    service: NodeServiceDependency,
) -> NodeRecord:
    try:
        return service.update_labels(node_id, payload.labels)
    except NodeNotFoundError as exc:
        raise _translate_error(exc) from exc


@router.post("/{node_id}/reconnect", response_model=NodeReconnectResponse)
def request_node_reconnect(
    node_id: UUID,
    service: NodeServiceDependency,
) -> NodeReconnectResponse:
    try:
        return service.request_reconnect(node_id)
    except (NodeNotFoundError, InvalidNodeTransitionError) as exc:
        raise _translate_error(exc) from exc


@router.delete(
    "/{node_id}",
    response_model=None,
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_node(node_id: UUID, service: NodeServiceDependency) -> Response:
    try:
        service.delete(node_id)
    except NodeNotFoundError as exc:
        raise _translate_error(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{node_id}", response_model=NodeRecord)
def get_node(node_id: UUID, service: NodeServiceDependency) -> NodeRecord:
    try:
        return service.get_node(node_id)
    except NodeNotFoundError as exc:
        raise _translate_error(exc) from exc
