from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Callable, TypeVar

from agent.collectors.accelerator import AcceleratorCollector, DefaultAcceleratorCollector
from agent.collectors.cpu import collect_cpu
from agent.collectors.memory import collect_memory
from agent.collectors.network import NetworkCollector
from agent.collectors.storage import collect_storage
from agent.models import AcceleratorSupport, ResourceReport

logger = logging.getLogger(__name__)
T = TypeVar("T")


def unsupported_accelerator() -> AcceleratorSupport:
    return {"supported": False, "available": False}


class ResourceCollector:
    def __init__(self, accelerator: AcceleratorCollector | None = None) -> None:
        self._network = NetworkCollector()
        self._accelerator = accelerator or DefaultAcceleratorCollector()

    @staticmethod
    def _required(name: str, collector: Callable[[], T]) -> T:
        try:
            return collector()
        except Exception:
            logger.exception("%s collector failed", name)
            raise

    def collect(self, preferred_ip: str | None = None) -> ResourceReport:
        """Collect one internally consistent report; callers handle retry on failure."""

        return {
            "collected_at": datetime.now(timezone.utc).isoformat(),
            "cpu": self._required("cpu", collect_cpu),
            "memory": self._required("memory", collect_memory),
            "storage": self._required("storage", collect_storage),
            # GPU collector contains its own failure state and never invents devices.
            "gpu": self._accelerator.collect_gpu(),
            "npu": unsupported_accelerator(),
            "dla": self._accelerator.collect_dla(),
            "network": self._required(
                "network", lambda: self._network.collect(preferred_ip)
            ),
        }
