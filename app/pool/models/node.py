from __future__ import annotations

import re
from datetime import datetime
from enum import StrEnum
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid", use_enum_values=False)


class RegistrationStatus(StrEnum):
    DISCOVERED = "DISCOVERED"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    REGISTERING = "REGISTERING"
    REGISTERED = "REGISTERED"
    REJECTED = "REJECTED"
    FAILED = "FAILED"
    REMOVED = "REMOVED"


class AuthorizationStatus(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REVOKED = "REVOKED"


class PoolMembership(StrEnum):
    IN_POOL = "IN_POOL"
    REMOVED = "REMOVED"


class RuntimeStatus(StrEnum):
    ONLINE = "ONLINE"
    RUNNING = "RUNNING"
    IDLE = "IDLE"
    SUSPECT = "SUSPECT"
    OFFLINE = "OFFLINE"
    RECONNECTING = "RECONNECTING"


class NodeOperationalStatus(StrEnum):
    ONLINE = "ONLINE"
    SUSPECT = "SUSPECT"
    OFFLINE = "OFFLINE"
    ABNORMAL = "ABNORMAL"


class HealthStatus(StrEnum):
    HEALTHY = "HEALTHY"
    DEGRADED = "DEGRADED"
    UNHEALTHY = "UNHEALTHY"


class LinkStatus(StrEnum):
    UP = "UP"
    DOWN = "DOWN"
    UNKNOWN = "UNKNOWN"


class ClusterRef(ApiModel):
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=100)


class IdentityPayload(ApiModel):
    node_id: UUID
    device_fingerprint: str | None = None
    hostname: str = Field(min_length=1, max_length=255)
    architecture: str = Field(min_length=1, max_length=64)
    operating_system: str = Field(min_length=1, max_length=100)
    os_version: str = Field(min_length=1, max_length=255)
    agent_version: str = Field(min_length=1, max_length=64)
    ip: str = Field(min_length=1, max_length=64)
    # sha256(/etc/machine-id); the platform binds it to K3s nodeInfo.machineID.
    machine_id_sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")

    @field_validator("device_fingerprint")
    @classmethod
    def validate_device_fingerprint(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        if not re.fullmatch(r"sha256:[0-9a-f]{64}", normalized):
            raise ValueError(
                "device_fingerprint must use the sha256:<64 lowercase hex chars> format"
            )
        return normalized


class RegisterRequest(ApiModel):
    identity: IdentityPayload
    # The top-level field is the canonical registration contract.  Accepting the
    # same value inside identity keeps a rolling Agent/Backend upgrade safe.
    device_fingerprint: str | None = None
    node_name: str | None = Field(default=None, max_length=255)
    cluster: ClusterRef | None = None
    labels: list[str] = Field(default_factory=list, max_length=100)
    node_source: Literal["agent"] = "agent"

    @field_validator("labels")
    @classmethod
    def normalize_labels(cls, labels: list[str]) -> list[str]:
        return list(dict.fromkeys(label.strip() for label in labels if label.strip()))

    @field_validator("device_fingerprint")
    @classmethod
    def validate_device_fingerprint(cls, value: str | None) -> str | None:
        return IdentityPayload.validate_device_fingerprint(value)

    @model_validator(mode="after")
    def reconcile_device_fingerprint(self) -> "RegisterRequest":
        nested = self.identity.device_fingerprint
        if self.device_fingerprint is not None and nested is not None:
            if self.device_fingerprint != nested:
                raise ValueError("device_fingerprint values do not match")
        fingerprint = self.device_fingerprint or nested
        self.device_fingerprint = fingerprint
        self.identity.device_fingerprint = fingerprint
        return self


class HeartbeatRequest(ApiModel):
    timestamp: datetime
    agent_version: str = Field(min_length=1, max_length=64)

    @field_validator("timestamp")
    @classmethod
    def timestamp_must_have_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamp must include a timezone")
        return value


class CpuReport(ApiModel):
    physical_cores: int = Field(ge=0)
    logical_cores: int = Field(ge=1)
    utilization_percent: float = Field(ge=0, le=100)
    frequency_mhz: float | None = Field(default=None, ge=0)


class MemoryReport(ApiModel):
    total_bytes: int = Field(gt=0)
    used_bytes: int = Field(ge=0)
    available_bytes: int = Field(ge=0)
    utilization_percent: float = Field(ge=0, le=100)

    @model_validator(mode="after")
    def validate_capacity(self) -> "MemoryReport":
        if (
            self.used_bytes > self.total_bytes
            or self.available_bytes > self.total_bytes
        ):
            raise ValueError("memory values cannot exceed total_bytes")
        return self


class StorageReport(ApiModel):
    mount_point: str = Field(min_length=1, max_length=255)
    total_bytes: int = Field(gt=0)
    used_bytes: int = Field(ge=0)
    available_bytes: int = Field(ge=0)
    utilization_percent: float = Field(ge=0, le=100)

    @model_validator(mode="after")
    def validate_capacity(self) -> "StorageReport":
        if (
            self.used_bytes > self.total_bytes
            or self.available_bytes > self.total_bytes
        ):
            raise ValueError("storage values cannot exceed total_bytes")
        return self


class GpuDevice(ApiModel):
    index: int = Field(ge=0)
    model: str = Field(min_length=1, max_length=255)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    utilization_percent: float | None = Field(default=None, ge=0, le=100)
    memory_total_mb: int | None = Field(default=None, ge=0)
    memory_used_mb: int | None = Field(default=None, ge=0)
    memory_available_mb: int | None = Field(default=None, ge=0)
    vram_total_bytes: int | None = Field(default=None, ge=0)
    vram_used_bytes: int | None = Field(default=None, ge=0)
    vram_available_bytes: int | None = Field(default=None, ge=0)

    @model_validator(mode="before")
    @classmethod
    def migrate_vram_fields(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        migrated = dict(value)
        if migrated.get("model") is None and migrated.get("name") is not None:
            migrated["model"] = migrated["name"]
        if migrated.get("name") is None and migrated.get("model") is not None:
            migrated["name"] = migrated["model"]
        for legacy_name, bytes_name in (
            ("memory_total_mb", "vram_total_bytes"),
            ("memory_used_mb", "vram_used_bytes"),
            ("memory_available_mb", "vram_available_bytes"),
        ):
            legacy = migrated.get(legacy_name)
            byte_value = migrated.get(bytes_name)
            if byte_value is None and legacy is not None:
                migrated[bytes_name] = int(legacy) * 1024 * 1024
            elif legacy is None and byte_value is not None:
                migrated[legacy_name] = round(int(byte_value) / (1024 * 1024))
        return migrated

    @model_validator(mode="after")
    def validate_vram_capacity(self) -> "GpuDevice":
        self.name = self.name or self.model
        pairs = (
            (self.vram_total_bytes, self.vram_used_bytes, "used"),
            (self.vram_total_bytes, self.vram_available_bytes, "available"),
        )
        for total, amount, label in pairs:
            if total is not None and amount is not None and amount > total:
                raise ValueError(f"GPU VRAM {label} cannot exceed total")
        return self


class GpuReport(ApiModel):
    supported: bool
    available: bool
    device_count: int = Field(ge=0)
    total_vram_bytes: int = Field(default=0, ge=0)
    used_vram_bytes: int = Field(default=0, ge=0)
    available_vram_bytes: int = Field(default=0, ge=0)
    utilization_percent: float | None = Field(default=None, ge=0, le=100)
    devices: list[GpuDevice] = Field(default_factory=list)
    # "unified": GPU shares system memory (Jetson/Thor); VRAM fields are not dedicated memory.
    memory_architecture: Literal["dedicated", "unified"] | None = None
    error: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="before")
    @classmethod
    def derive_legacy_totals(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        migrated = dict(value)
        devices = migrated.get("devices") or []

        def device_bytes(device: object, bytes_name: str, mb_name: str) -> int:
            if isinstance(device, BaseModel):
                byte_value = getattr(device, bytes_name, None)
                mb_value = getattr(device, mb_name, None)
            elif isinstance(device, dict):
                byte_value = device.get(bytes_name)
                mb_value = device.get(mb_name)
            else:
                return 0
            if byte_value is not None:
                return int(byte_value)
            return int(mb_value or 0) * 1024 * 1024

        for total_name, device_name, legacy_name in (
            ("total_vram_bytes", "vram_total_bytes", "memory_total_mb"),
            ("used_vram_bytes", "vram_used_bytes", "memory_used_mb"),
            (
                "available_vram_bytes",
                "vram_available_bytes",
                "memory_available_mb",
            ),
        ):
            if migrated.get(total_name) is None:
                migrated[total_name] = sum(
                    device_bytes(device, device_name, legacy_name)
                    for device in devices
                )

        if "utilization_percent" not in migrated:
            values: list[float] = []
            for device in devices:
                if isinstance(device, BaseModel):
                    utilization = getattr(device, "utilization_percent", None)
                elif isinstance(device, dict):
                    utilization = device.get("utilization_percent")
                else:
                    utilization = None
                if utilization is not None:
                    values.append(float(utilization))
            migrated["utilization_percent"] = (
                sum(values) / len(values) if values else None
            )
        return migrated

    @model_validator(mode="after")
    def validate_devices(self) -> "GpuReport":
        if self.device_count != len(self.devices):
            raise ValueError("device_count must equal the number of devices")
        if not self.supported and (
            self.available
            or self.devices
            or self.total_vram_bytes
            or self.used_vram_bytes
            or self.available_vram_bytes
            or self.utilization_percent is not None
        ):
            raise ValueError(
                "unsupported GPU cannot be available or contain devices/resources"
            )
        if self.used_vram_bytes > self.total_vram_bytes:
            raise ValueError("used_vram_bytes cannot exceed total_vram_bytes")
        if self.available_vram_bytes > self.total_vram_bytes:
            raise ValueError("available_vram_bytes cannot exceed total_vram_bytes")
        for report_name, device_name in (
            ("total_vram_bytes", "vram_total_bytes"),
            ("used_vram_bytes", "vram_used_bytes"),
            ("available_vram_bytes", "vram_available_bytes"),
        ):
            device_values = [getattr(device, device_name) for device in self.devices]
            if device_values and all(value is not None for value in device_values):
                if getattr(self, report_name) != sum(
                    int(value) for value in device_values if value is not None
                ):
                    raise ValueError(
                        f"{report_name} must equal the sum of device {device_name}"
                    )
        return self


class AcceleratorSupport(ApiModel):
    supported: bool
    available: bool = False
    tops: float = Field(default=0, ge=0)
    device_count: int = Field(default=0, ge=0)
    utilization_percent: float | None = Field(default=None, ge=0, le=100)
    error: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_support_state(self) -> "AcceleratorSupport":
        if not self.supported:
            if (
                self.available
                or self.tops != 0
                or self.device_count != 0
                or self.utilization_percent is not None
            ):
                raise ValueError(
                    "unsupported accelerator cannot be available or report capacity/utilization"
                )
            return self

        if self.available and self.tops == 0 and self.device_count == 0:
            raise ValueError("available accelerator must report a positive capacity")
        if self.available and self.error is not None:
            raise ValueError("available accelerator cannot contain a collection error")
        if not self.available and self.utilization_percent is not None:
            raise ValueError("unavailable accelerator cannot report utilization")
        return self


class NetworkReport(ApiModel):
    ip: str = Field(min_length=1, max_length=64)
    network_interface: str = Field(min_length=1, max_length=255)
    link_status: LinkStatus
    bytes_sent: int = Field(ge=0)
    bytes_received: int = Field(ge=0)
    tx_rate_bytes_per_second: float | None = Field(default=None, ge=0)
    rx_rate_bytes_per_second: float | None = Field(default=None, ge=0)
    mac_address: str | None = Field(default=None, max_length=64)
    link_speed_mbps: float | None = Field(default=None, ge=0)


class ResourceReportRequest(ApiModel):
    collected_at: datetime
    cpu: CpuReport
    memory: MemoryReport
    storage: StorageReport
    gpu: GpuReport
    npu: AcceleratorSupport
    dla: AcceleratorSupport
    network: NetworkReport

    @field_validator("collected_at")
    @classmethod
    def collected_at_must_have_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("collected_at must include a timezone")
        return value


class NodeRecord(ApiModel):
    node_id: UUID
    device_fingerprint: str | None = None
    node_name: str
    node_source: Literal["agent"] = "agent"
    identity: IdentityPayload
    cluster_id: str | None = Field(default=None, min_length=1, max_length=100)
    cluster: ClusterRef | None = None
    labels: list[str] = Field(default_factory=list)
    registration_status: RegistrationStatus
    ever_approved: bool = False
    authorization_status: AuthorizationStatus = AuthorizationStatus.PENDING
    pool_membership: PoolMembership = PoolMembership.REMOVED
    runtime_status: RuntimeStatus
    operational_status: NodeOperationalStatus = NodeOperationalStatus.ONLINE
    health_status: HealthStatus = HealthStatus.HEALTHY
    scheduling_enabled: bool = False
    schedulable: bool = False
    discovered_at: datetime
    last_registered_at: datetime | None = None
    registered_at: datetime | None = None
    last_heartbeat_at: datetime | None = None
    last_agent_timestamp: datetime | None = None
    last_resource_at: datetime | None = None
    resources: ResourceReportRequest | None = None
    removed_at: datetime | None = None
    removed_reason: str | None = None

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_membership(cls, value: object) -> object:
        """Derive the split authorization/membership state from legacy records."""

        if not isinstance(value, dict):
            return value

        migrated = dict(value)
        legacy_cluster = migrated.get("cluster")
        if "cluster_id" not in migrated and legacy_cluster is not None:
            if isinstance(legacy_cluster, dict):
                migrated["cluster_id"] = legacy_cluster.get("id")
            else:
                migrated["cluster_id"] = getattr(legacy_cluster, "id", None)
        identity = migrated.get("identity")
        nested_fingerprint = (
            identity.get("device_fingerprint") if isinstance(identity, dict) else None
        )
        if "device_fingerprint" not in migrated:
            migrated["device_fingerprint"] = nested_fingerprint
        elif isinstance(identity, dict) and "device_fingerprint" not in identity:
            migrated_identity = dict(identity)
            migrated_identity["device_fingerprint"] = migrated.get(
                "device_fingerprint"
            )
            migrated["identity"] = migrated_identity
        registration = migrated.get("registration_status")
        registration_value = getattr(registration, "value", registration)
        authorization = migrated.get("authorization_status")
        authorization_value = getattr(authorization, "value", authorization)

        if "ever_approved" not in migrated:
            migrated["ever_approved"] = (
                authorization_value == AuthorizationStatus.APPROVED.value
                or registration_value
                in {
                    RegistrationStatus.REGISTERED.value,
                    RegistrationStatus.REMOVED.value,
                }
            )

        was_approved = bool(migrated["ever_approved"])
        if "authorization_status" not in migrated:
            if registration_value == RegistrationStatus.REJECTED.value:
                migrated["authorization_status"] = AuthorizationStatus.REVOKED
            elif was_approved:
                migrated["authorization_status"] = AuthorizationStatus.APPROVED
            else:
                migrated["authorization_status"] = AuthorizationStatus.PENDING

        effective_authorization = migrated["authorization_status"]
        effective_authorization_value = getattr(
            effective_authorization, "value", effective_authorization
        )
        if "pool_membership" not in migrated:
            migrated["pool_membership"] = (
                PoolMembership.IN_POOL
                if (
                    registration_value == RegistrationStatus.REGISTERED.value
                    and effective_authorization_value
                    == AuthorizationStatus.APPROVED.value
                    and migrated.get("removed_at") is None
                )
                else PoolMembership.REMOVED
            )

        if "operational_status" not in migrated:

            def read_field(source: object, name: str) -> object | None:
                if isinstance(source, dict):
                    return source.get(name)
                return getattr(source, name, None)

            runtime = migrated.get("runtime_status")
            runtime_value = getattr(runtime, "value", runtime)
            health = migrated.get("health_status", HealthStatus.HEALTHY)
            health_value = getattr(health, "value", health)
            resources = migrated.get("resources")
            network = read_field(resources, "network")
            link_status = read_field(network, "link_status")
            link_status_value = getattr(link_status, "value", link_status)
            has_resource_error = any(
                read_field(read_field(resources, kind), "error") is not None
                for kind in ("gpu", "npu", "dla")
            )

            if runtime_value == RuntimeStatus.OFFLINE.value:
                status = NodeOperationalStatus.OFFLINE
            elif runtime_value in {
                RuntimeStatus.SUSPECT.value,
                RuntimeStatus.RECONNECTING.value,
            }:
                status = NodeOperationalStatus.SUSPECT
            elif health_value != HealthStatus.HEALTHY.value:
                status = NodeOperationalStatus.ABNORMAL
            elif (
                registration_value == RegistrationStatus.REGISTERED.value
                and resources is None
            ):
                status = NodeOperationalStatus.ABNORMAL
            elif resources is not None and (
                link_status_value not in {None, LinkStatus.UP.value}
                or has_resource_error
            ):
                status = NodeOperationalStatus.ABNORMAL
            else:
                status = NodeOperationalStatus.ONLINE
            migrated["operational_status"] = status
        return migrated

    @field_validator("device_fingerprint")
    @classmethod
    def validate_device_fingerprint(cls, value: str | None) -> str | None:
        return IdentityPayload.validate_device_fingerprint(value)

    @model_validator(mode="after")
    def keep_identity_fingerprint_consistent(self) -> "NodeRecord":
        if self.identity.node_id != self.node_id:
            raise ValueError("identity.node_id must equal node_id")
        nested = self.identity.device_fingerprint
        if self.device_fingerprint is not None and nested is not None:
            if self.device_fingerprint != nested:
                raise ValueError("node and identity device_fingerprint values do not match")
        fingerprint = self.device_fingerprint or nested
        self.device_fingerprint = fingerprint
        self.identity.device_fingerprint = fingerprint
        if self.cluster is not None:
            if self.cluster_id is not None and self.cluster_id != self.cluster.id:
                raise ValueError("cluster_id must equal cluster.id")
            self.cluster_id = self.cluster.id
        return self


class NodeListResponse(ApiModel):
    items: list[NodeRecord]
    total: int = Field(ge=0)
    updated_at: datetime


class RegistrationResultStatus(StrEnum):
    NEW_DEVICE = "NEW_DEVICE"
    EXISTING_NODE = "EXISTING_NODE"
    EXISTING_DEVICE = "EXISTING_DEVICE"


class NodeRegistrationResponse(NodeRecord):
    """Backward-compatible Node response plus canonical identity metadata."""

    status: RegistrationResultStatus
    canonical_node_id: UUID


class NodeActionRequest(ApiModel):
    reason: str | None = Field(default=None, max_length=1000)


class NodeLabelsRequest(ApiModel):
    labels: list[str] = Field(default_factory=list, max_length=32)

    @field_validator("labels")
    @classmethod
    def normalize_labels(cls, labels: list[str]) -> list[str]:
        normalized: list[str] = []
        values_by_key: dict[str, str] = {}

        for raw_label in labels:
            label = raw_label.strip()
            key, separator, value = label.partition(":")
            if not separator or not key or not value or ":" in value:
                raise ValueError("labels must use non-empty key:value format")
            if len(key) > 63 or len(value) > 127:
                raise ValueError("label key/value exceeds the supported length")
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", key):
                raise ValueError("label key contains unsupported characters")
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", value):
                raise ValueError("label value contains unsupported characters")

            existing = values_by_key.get(key)
            if existing is not None:
                if existing != value:
                    raise ValueError(f"label key '{key}' is duplicated")
                continue

            values_by_key[key] = value
            normalized.append(f"{key}:{value}")

        return normalized


class NodeReconnectResponse(ApiModel):
    node_id: UUID
    node_name: str
    current_status: NodeOperationalStatus
    registration_status: RegistrationStatus
    pool_membership: PoolMembership
    schedulable: bool
    remote_start_supported: Literal[False] = False
    credential_reissue_supported: Literal[False] = False
    node_id_must_be_preserved: Literal[True] = True
    requested_at: datetime
    guidance: list[str]


class ManualConnectRequest(ApiModel):
    agent_address: str = Field(min_length=1, max_length=2048)
    node_name: str | None = Field(default=None, max_length=255)
    cluster: ClusterRef | None = None
    labels: list[str] = Field(default_factory=list, max_length=100)


class RegistrationRecord(ApiModel):
    id: UUID = Field(default_factory=uuid4)
    node_id: UUID
    node_name: str
    started_at: datetime
    completed_at: datetime | None = None
    result: Literal["IN_PROGRESS", "SUCCESS", "FAILED"]
    failure_reason: str | None = None
    reconnect_status: Literal["NOT_REQUIRED", "PENDING", "IN_PROGRESS", "RECOVERED"] = (
        "NOT_REQUIRED"
    )


class NodeRegistrationRecord(RegistrationRecord):
    duration_seconds: float | None = Field(default=None, ge=0)


class NodeEvent(ApiModel):
    id: UUID = Field(default_factory=uuid4)
    node_id: UUID
    node_name: str
    event_type: str = Field(min_length=1, max_length=100)
    level: Literal["INFO", "WARNING", "ERROR"]
    message: str = Field(min_length=1, max_length=1000)
    occurred_at: datetime
