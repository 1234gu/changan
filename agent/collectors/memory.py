from __future__ import annotations

import psutil

from agent.models import MemoryReport


def collect_memory() -> MemoryReport:
    memory = psutil.virtual_memory()
    return {
        "total_bytes": int(memory.total),
        "used_bytes": int(memory.used),
        "available_bytes": int(memory.available),
        "utilization_percent": round(float(memory.percent), 1),
    }
