from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.clusters import router as clusters_router
from .api.compute_pool import router as compute_pool_router
from .api.nodes import router as nodes_router
from .api.scheduler_sync import router as scheduler_sync_router
from .config import Settings, get_settings
from .services.node_service import NodeService, utc_now
from .services.cluster_service import ClusterService
from .services.resource_aggregation import ResourceAggregationService
from .services.resource_directory import ResourceDirectoryService
from .services.scheduler_sync_service import SchedulerSyncService
from .services.status_monitor import run_status_monitor
from .stores.base import NodeStore
from .stores.sqlite import SQLiteNodeStore

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


def create_app(
    settings: Settings | None = None, store: NodeStore | None = None
) -> FastAPI:
    active_settings = settings or get_settings()
    active_store = store or SQLiteNodeStore(active_settings.node_db_path)
    node_service = NodeService(store=active_store, settings=active_settings)
    resource_aggregation_service = ResourceAggregationService(active_store)
    resource_directory_service = ResourceDirectoryService(active_store, active_settings)
    scheduler_sync_service = SchedulerSyncService(active_store)
    cluster_service = ClusterService(active_store, resource_aggregation_service)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        monitor = asyncio.create_task(
            run_status_monitor(node_service, active_settings),
            name="node-status-monitor",
        )
        try:
            yield
        finally:
            monitor.cancel()
            with suppress(asyncio.CancelledError):
                await monitor
            active_store.close()

    app = FastAPI(
        title="车群算力管理平台 API",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.node_service = node_service
    app.state.resource_aggregation_service = resource_aggregation_service
    app.state.resource_directory_service = resource_directory_service
    app.state.scheduler_sync_service = scheduler_sync_service
    app.state.cluster_service = cluster_service
    app.state.node_store = active_store
    app.state.settings = active_settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(active_settings.cors_allowed_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Accept"],
    )
    app.include_router(nodes_router)
    app.include_router(compute_pool_router)
    app.include_router(clusters_router)
    app.include_router(scheduler_sync_router)

    @app.get("/health", tags=["system"])
    def health() -> dict[str, str]:
        return {"status": "ok", "timestamp": utc_now().isoformat()}

    return app


app = create_app()
