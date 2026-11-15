from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from pydantic import Field

from .node import ApiModel


class NodeHeartbeatRecord(ApiModel):
    """Persisted receipt of one Agent heartbeat."""

    id: UUID = Field(default_factory=uuid4)
    node_id: UUID
    received_at: datetime
    agent_timestamp: datetime
    agent_version: str = Field(min_length=1, max_length=64)
