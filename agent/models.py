from __future__ import annotations

from typing import NotRequired, TypedDict


class IdentityPayload(TypedDict):
    node_id: str
    # Exposed through the discovery endpoint so manual connect can deduplicate
    # the same physical device even when its local state file was regenerated.
    device_fingerprint: NotRequired[str]
    hostname: str
    architecture: str
    operating_system: str
    os_version: str
    agent_version: str
    ip: str
    # sha256 of /etc/machine-id; equals sha256 of Kubernetes nodeInfo.machineID.
    machine_id_sha256: NotRequired[str]


class CpuReport(TypedDict):
    physical_cores: int
    logical_cores: int
    utilization_percent: float
    frequency_mhz: float | None


class MemoryReport(TypedDict):
    total_bytes: int
    used_bytes: int
    available_bytes: int
    utilization_percent: float


class StorageReport(TypedDict):
    mount_point: str
    total_bytes: int
    used_bytes: int
    available_bytes: int
    utilization_percent: float


class GpuDeviceReport(TypedDict):
    index: int
    name: str
    model: str
    utilization_percent: float | None
    vram_total_bytes: int | None
    vram_used_bytes: int | None
    vram_available_bytes: int | None
    memory_total_mb: int | None
    memory_used_mb: int | None
    memory_available_mb: int | None


class GpuReport(TypedDict):
    supported: bool
    available: bool
    device_count: int
    total_vram_bytes: int
    used_vram_bytes: int
    available_vram_bytes: int
    utilization_percent: float | None
    devices: list[GpuDeviceReport]
    # 'unified' on Jetson/Thor: GPU shares system memory; no dedicated VRAM.
    memory_architecture: NotRequired[str]
    error: NotRequired[str | None]


class AcceleratorSupport(TypedDict):
    supported: bool
    available: bool
    tops: NotRequired[float]
    device_count: NotRequired[int]
    utilization_percent: NotRequired[float | None]
    error: NotRequired[str | None]


class NetworkReport(TypedDict):
    ip: str
    network_interface: str
    link_status: str
    bytes_sent: int
    bytes_received: int
    tx_rate_bytes_per_second: float | None
    rx_rate_bytes_per_second: float | None
    mac_address: str | None
    link_speed_mbps: float | None


class ResourceReport(TypedDict):
    collected_at: str
    cpu: CpuReport
    memory: MemoryReport
    storage: StorageReport
    gpu: GpuReport
    npu: AcceleratorSupport
    dla: AcceleratorSupport
    network: NetworkReport
