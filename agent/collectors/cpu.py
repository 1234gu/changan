from __future__ import annotations

import psutil

from agent.models import CpuReport


def collect_cpu() -> CpuReport:
    logical = psutil.cpu_count(logical=True) or 1
    physical = psutil.cpu_count(logical=False) or 0
    frequency = psutil.cpu_freq()
    current_mhz = float(frequency.current) if frequency is not None else None
    return {
        "physical_cores": int(physical),
        "logical_cores": int(logical),
        "utilization_percent": round(float(psutil.cpu_percent(interval=0.1)), 1),
        "frequency_mhz": round(current_mhz, 1) if current_mhz is not None else None,
    }
