from __future__ import annotations

from dataclasses import asdict
from typing import Any

from agent.client.http_client import BackendClient
from agent.config import AgentConfig
from agent.models import IdentityPayload


def register_node(
    client: BackendClient,
    config: AgentConfig,
    identity: IdentityPayload,
    device_fingerprint: str,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "identity": identity,
        "device_fingerprint": device_fingerprint,
        "node_name": config.node_name,
        "labels": list(config.labels),
        "node_source": "agent",
    }
    if config.cluster is not None:
        payload["cluster"] = asdict(config.cluster)
    return client.post("/api/v1/nodes/register", payload)
