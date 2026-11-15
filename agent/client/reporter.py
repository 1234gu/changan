from __future__ import annotations

from typing import Any

from agent.client.http_client import BackendClient
from agent.models import ResourceReport


def report_resources(
    client: BackendClient,
    node_id: str,
    report: ResourceReport,
) -> dict[str, Any]:
    return client.post(f"/api/v1/nodes/{node_id}/resources", report)
