from __future__ import annotations

import ipaddress
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import urlparse

import yaml


class AgentConfigurationError(ValueError):
    """Raised when the agent configuration is incomplete or invalid."""


@dataclass(frozen=True, slots=True)
class ClusterConfig:
    id: str
    name: str


@dataclass(frozen=True, slots=True)
class BackendConfig:
    url: str
    request_timeout_seconds: float


@dataclass(frozen=True, slots=True)
class DiscoveryConfig:
    enabled: bool
    listen_host: str
    port: int


@dataclass(frozen=True, slots=True)
class AgentConfig:
    node_name: str | None
    advertise_ip: str | None
    backend: BackendConfig
    heartbeat_interval_seconds: float
    resource_report_interval_seconds: float
    reconnect_interval_seconds: float
    reconnect_max_interval_seconds: float
    state_file: Path
    config_file: Path
    log_file: Path
    labels: tuple[str, ...]
    cluster: ClusterConfig | None
    discovery: DiscoveryConfig
    log_level: str
    backend_source: str

    @property
    def state_dir(self) -> Path:
        return self.state_file.parent


def application_dir() -> Path:
    """Stable directory for state in source and PyInstaller one-file modes."""

    if bool(getattr(sys, "frozen", False)):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def default_legacy_config_path() -> Path:
    return application_dir() / "config.yaml"


def normalize_backend_url(value: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        raise AgentConfigurationError("backend URL is required")
    if "://" not in normalized:
        normalized = f"http://{normalized}"
    normalized = normalized.rstrip("/")
    parsed = urlparse(normalized)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise AgentConfigurationError(
            "backend URL must be an absolute HTTP(S) URL without credentials, query, or fragment"
        )
    return normalized


def _mapping(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise AgentConfigurationError(f"{name} must be a mapping")
    return value


def _positive(value: Any, name: str) -> float:
    if isinstance(value, bool):
        raise AgentConfigurationError(f"{name} must be a positive number")
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise AgentConfigurationError(f"{name} must be a positive number") from exc
    if result <= 0:
        raise AgentConfigurationError(f"{name} must be positive")
    return result


def _boolean(value: Any, name: str) -> bool:
    if not isinstance(value, bool):
        raise AgentConfigurationError(f"{name} must be true or false")
    return value


def _read_yaml(path: Path, *, missing_ok: bool) -> dict[str, Any]:
    try:
        document = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except FileNotFoundError:
        if missing_ok:
            return {}
        raise AgentConfigurationError(f"cannot read config file: {path}") from None
    except OSError as exc:
        raise AgentConfigurationError(f"cannot read config file: {path}") from exc
    except yaml.YAMLError as exc:
        raise AgentConfigurationError(f"invalid YAML in {path}") from exc
    return _mapping(document, "config")


def _read_json(path: Path) -> dict[str, Any]:
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except OSError as exc:
        raise AgentConfigurationError(f"cannot read config file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise AgentConfigurationError(f"invalid JSON in {path}") from exc
    return _mapping(document, "saved config")


def _state_file(raw: Mapping[str, Any], config_path: Path) -> Path:
    value = str(raw.get("state_file", ".state/node_id")).strip()
    if not value:
        raise AgentConfigurationError("state_file cannot be empty")
    result = Path(value).expanduser()
    if not result.is_absolute():
        result = config_path.parent / result
    return result.resolve()


def _cluster(value: Any) -> ClusterConfig | None:
    if value is None:
        return None
    raw = _mapping(value, "cluster")
    cluster_id = str(raw.get("id", "")).strip()
    name = str(raw.get("name", "")).strip()
    if not cluster_id or not name:
        raise AgentConfigurationError("cluster.id and cluster.name are both required")
    return ClusterConfig(id=cluster_id, name=name)


def _backend_url(
    cli_backend_url: str | None,
    environment: Mapping[str, str],
    saved: Mapping[str, Any],
    yaml_backend: Mapping[str, Any],
) -> tuple[str, str]:
    # BACKEND_URL is the public compatibility variable. The older project-
    # specific name remains accepted so an in-place upgrade does not regress.
    candidates = (
        ("--server", cli_backend_url),
        ("BACKEND_URL", environment.get("BACKEND_URL")),
        ("VEHICULAR_BACKEND_URL", environment.get("VEHICULAR_BACKEND_URL")),
        ("config.json", saved.get("backend_url")),
        ("config.yaml", yaml_backend.get("url")),
    )
    for source, value in candidates:
        if value is not None and str(value).strip():
            return normalize_backend_url(str(value)), source
    raise AgentConfigurationError(
        "Agent configuration missing. Configure backend URL using --server, "
        "BACKEND_URL, --configure, or interactive first start."
    )


def load_config(
    path: str | Path | None = None,
    *,
    cli_backend_url: str | None = None,
    environment: Mapping[str, str] | None = None,
) -> AgentConfig:
    """Load legacy YAML defaults and the portable .state/config.json."""

    config_path = (
        Path(path).expanduser().resolve() if path else default_legacy_config_path()
    )
    raw = _read_yaml(config_path, missing_ok=path is None)
    backend_raw = _mapping(raw.get("backend", {}), "backend")
    discovery_raw = _mapping(raw.get("discovery", {}), "discovery")
    state_file = _state_file(raw, config_path)
    saved_path = state_file.parent / "config.json"
    saved = _read_json(saved_path)
    backend_url, source = _backend_url(
        cli_backend_url,
        environment if environment is not None else os.environ,
        saved,
        backend_raw,
    )

    heartbeat = _positive(
        saved.get(
            "heartbeat_interval_seconds",
            raw.get("heartbeat_interval_seconds", 5),
        ),
        "heartbeat_interval_seconds",
    )
    resource_interval = _positive(
        saved.get(
            "resource_interval_seconds",
            raw.get("resource_report_interval_seconds", 5),
        ),
        "resource_interval_seconds",
    )
    reconnect = _positive(
        raw.get("reconnect_interval_seconds", 3), "reconnect_interval_seconds"
    )
    reconnect_max = _positive(
        raw.get("reconnect_max_interval_seconds", 30),
        "reconnect_max_interval_seconds",
    )
    if reconnect_max < reconnect:
        raise AgentConfigurationError(
            "reconnect_max_interval_seconds cannot be less than reconnect_interval_seconds"
        )

    labels_value = raw.get("labels", [])
    if not isinstance(labels_value, list):
        raise AgentConfigurationError("labels must be a YAML list")
    labels = tuple(
        dict.fromkeys(str(item).strip() for item in labels_value if str(item).strip())
    )

    listen_host = str(discovery_raw.get("listen_host", "0.0.0.0")).strip()
    try:
        discovery_port = int(discovery_raw.get("port", 8765))
    except (TypeError, ValueError) as exc:
        raise AgentConfigurationError("discovery.port must be an integer") from exc
    if not listen_host or not 1 <= discovery_port <= 65535:
        raise AgentConfigurationError("invalid discovery listen_host or port")

    advertise_value = raw.get("advertise_ip")
    advertise_ip = str(advertise_value).strip() if advertise_value is not None else None
    if advertise_ip:
        try:
            parsed_ip = ipaddress.ip_address(advertise_ip)
        except ValueError as exc:
            raise AgentConfigurationError("advertise_ip must be a valid IPv4 address") from exc
        if (
            parsed_ip.version != 4
            or parsed_ip.is_unspecified
            or parsed_ip.is_loopback
            or parsed_ip.is_multicast
        ):
            raise AgentConfigurationError(
                "advertise_ip must be a non-loopback unicast IPv4 address"
            )

    node_name_value = raw.get("node_name")
    node_name = str(node_name_value).strip() if node_name_value is not None else None
    return AgentConfig(
        node_name=node_name or None,
        advertise_ip=advertise_ip or None,
        backend=BackendConfig(
            url=backend_url,
            request_timeout_seconds=_positive(
                backend_raw.get("request_timeout_seconds", 5),
                "backend.request_timeout_seconds",
            ),
        ),
        heartbeat_interval_seconds=heartbeat,
        resource_report_interval_seconds=resource_interval,
        reconnect_interval_seconds=reconnect,
        reconnect_max_interval_seconds=reconnect_max,
        state_file=state_file,
        config_file=saved_path,
        log_file=state_file.parent / "logs" / "agent.log",
        labels=labels,
        cluster=_cluster(raw.get("cluster")),
        discovery=DiscoveryConfig(
            enabled=_boolean(discovery_raw.get("enabled", True), "discovery.enabled"),
            listen_host=listen_host,
            port=discovery_port,
        ),
        log_level=str(raw.get("log_level", "INFO")).strip().upper() or "INFO",
        backend_source=source,
    )


def save_config(config: AgentConfig, backend_url: str | None = None) -> None:
    """Atomically persist config.json without ever changing node_id."""

    payload = {
        "backend_url": normalize_backend_url(backend_url or config.backend.url),
        "heartbeat_interval_seconds": config.heartbeat_interval_seconds,
        "resource_interval_seconds": config.resource_report_interval_seconds,
    }
    temporary = config.config_file.with_name(
        f".{config.config_file.name}.{os.getpid()}.tmp"
    )
    try:
        config.config_file.parent.mkdir(parents=True, exist_ok=True)
        temporary.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        os.replace(temporary, config.config_file)
    except OSError as exc:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass
        raise AgentConfigurationError(
            f"cannot persist config file: {config.config_file}"
        ) from exc
