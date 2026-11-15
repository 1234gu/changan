from __future__ import annotations

import asyncio
import logging

from ..config import Settings
from .node_service import NodeService

logger = logging.getLogger(__name__)


async def run_status_monitor(service: NodeService, settings: Settings) -> None:
    while True:
        try:
            service.evaluate_heartbeat_timeouts()
        except Exception:
            logger.exception("node status monitor failed")
        await asyncio.sleep(settings.status_monitor_interval_seconds)
