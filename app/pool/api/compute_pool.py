from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from ..models.compute_pool import ComputePoolSummary
from ..models.resource_candidate import CandidateQueryRequest, CandidateQueryResponse
from ..services.resource_directory import (
    AllowedNodesCrossClusterError,
    CrossClusterExecutionNotSupportedError,
    ResourceDirectoryService,
)
from ..services.resource_aggregation import ResourceAggregationService

router = APIRouter(prefix="/api/v1/compute-pool", tags=["compute-pool"])


def get_resource_aggregation_service(request: Request) -> ResourceAggregationService:
    return request.app.state.resource_aggregation_service


ResourceAggregationDependency = Annotated[
    ResourceAggregationService, Depends(get_resource_aggregation_service)
]


def get_resource_directory_service(request: Request) -> ResourceDirectoryService:
    return request.app.state.resource_directory_service


ResourceDirectoryDependency = Annotated[
    ResourceDirectoryService, Depends(get_resource_directory_service)
]


@router.get("/summary", response_model=ComputePoolSummary)
def get_compute_pool_summary(
    service: ResourceAggregationDependency,
) -> ComputePoolSummary:
    return service.get_summary()


@router.post("/candidates", response_model=CandidateQueryResponse)
def query_compute_pool_candidates(
    payload: CandidateQueryRequest,
    service: ResourceDirectoryDependency,
) -> CandidateQueryResponse:
    try:
        return service.query_candidates(payload)
    except CrossClusterExecutionNotSupportedError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc
    except AllowedNodesCrossClusterError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc
