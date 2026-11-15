from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from agent import __version__
from agent.client.http_client import BackendClient


def send_heartbeat(client: BackendClient, node_id: str) -> dict[str, Any]:
    return client.post(
        f"/api/v1/nodes/{node_id}/heartbeat",
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "agent_version": __version__,
        },
    )
