from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


DEFAULT_NODE_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "nodes.db"


def _env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError as exc:
        raise ValueError(f"{name} must be a number") from exc


def _env_origins() -> tuple[str, ...]:
    raw = os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )
    origins = tuple(
        origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()
    )
    if not origins:
        raise ValueError("CORS_ALLOWED_ORIGINS must contain at least one origin")
    return origins


@dataclass(frozen=True, slots=True)
class Settings:
    suspect_after_seconds: float = 6.0
    offline_after_seconds: float = 15.0
    resource_stale_after_seconds: float = 15.0
    status_monitor_interval_seconds: float = 1.0
    manual_connect_timeout_seconds: float = 3.0
    node_db_path: Path = DEFAULT_NODE_DB_PATH
    cors_allowed_origins: tuple[str, ...] = (
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    )

    def __post_init__(self) -> None:
        if self.suspect_after_seconds <= 0:
            raise ValueError("suspect_after_seconds must be positive")
        if self.offline_after_seconds <= self.suspect_after_seconds:
            raise ValueError(
                "offline_after_seconds must be greater than suspect_after_seconds"
            )
        if self.resource_stale_after_seconds <= 0:
            raise ValueError("resource_stale_after_seconds must be positive")
        if self.status_monitor_interval_seconds <= 0:
            raise ValueError("status_monitor_interval_seconds must be positive")
        if self.manual_connect_timeout_seconds <= 0:
            raise ValueError("manual_connect_timeout_seconds must be positive")

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            suspect_after_seconds=_env_float("NODE_SUSPECT_AFTER_SECONDS", 6.0),
            offline_after_seconds=_env_float("NODE_OFFLINE_AFTER_SECONDS", 15.0),
            resource_stale_after_seconds=_env_float(
                "NODE_RESOURCE_STALE_AFTER_SECONDS", 15.0
            ),
            status_monitor_interval_seconds=_env_float(
                "NODE_MONITOR_INTERVAL_SECONDS", 1.0
            ),
            manual_connect_timeout_seconds=_env_float(
                "MANUAL_CONNECT_TIMEOUT_SECONDS", 3.0
            ),
            node_db_path=Path(os.getenv("NODE_DB_PATH", str(DEFAULT_NODE_DB_PATH))),
            cors_allowed_origins=_env_origins(),
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.from_env()
