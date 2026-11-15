from __future__ import annotations

from typing import Protocol

from agent.collectors.gpu import collect_gpu
from agent.models import AcceleratorSupport, GpuReport


class AcceleratorCollector(Protocol):
    """Stable extension boundary for future platform-specific accelerators."""

    def collect_gpu(self) -> GpuReport: ...

    def collect_dla(self) -> AcceleratorSupport: ...


class DefaultAcceleratorCollector:
    """Current desktop NVIDIA behavior; no THOR-specific assumptions."""

    def collect_gpu(self) -> GpuReport:
        return collect_gpu()

    def collect_dla(self) -> AcceleratorSupport:
        return {"supported": False, "available": False}
