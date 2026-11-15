from __future__ import annotations

import os
from pathlib import Path

import psutil

from agent.models import StorageReport


def system_mount_point() -> Path:
    if os.name == "nt":
        system_drive = os.environ.get("SystemDrive", "C:").rstrip("\\/")
        return Path(f"{system_drive}\\")
    return Path(os.path.abspath(os.sep))


def collect_storage(mount_point: Path | None = None) -> StorageReport:
    target = mount_point or system_mount_point()
    usage = psutil.disk_usage(str(target))
    return {
        "mount_point": str(target),
        "total_bytes": int(usage.total),
        "used_bytes": int(usage.used),
        "available_bytes": int(usage.free),
        "utilization_percent": round(float(usage.percent), 1),
    }
