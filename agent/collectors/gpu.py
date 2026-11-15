from __future__ import annotations

import csv
import io
import os
import platform
import shutil
import subprocess
from pathlib import Path

from agent.models import GpuDeviceReport, GpuReport

QUERY_FIELDS = (
    "index",
    "name",
    "utilization.gpu",
    "memory.total",
    "memory.used",
    "memory.free",
)
MEBIBYTE = 1024 * 1024


def find_nvidia_smi() -> str | None:
    located = shutil.which("nvidia-smi")
    if located:
        return located
    if platform.system().casefold() == "linux":
        for candidate in (
            Path("/usr/bin/nvidia-smi"),
            Path("/usr/local/bin/nvidia-smi"),
            Path("/usr/local/cuda/bin/nvidia-smi"),
        ):
            if candidate.is_file():
                return str(candidate)
    if os.name == "nt":
        system_root = Path(os.environ.get("SystemRoot", r"C:\Windows"))
        candidate = system_root / "System32" / "nvidia-smi.exe"
        if candidate.is_file():
            return str(candidate)
    return None


def _optional_float(value: str) -> float | None:
    normalized = value.strip()
    if not normalized or normalized.upper() in {"N/A", "[N/A]", "NOT SUPPORTED"}:
        return None
    return float(normalized)


def _optional_int(value: str) -> int | None:
    parsed = _optional_float(value)
    return int(round(parsed)) if parsed is not None else None


def _parse_devices(output: str) -> list[GpuDeviceReport]:
    devices: list[GpuDeviceReport] = []
    rows = csv.reader(io.StringIO(output), skipinitialspace=True)
    for row in rows:
        if not row or all(not cell.strip() for cell in row):
            continue
        if len(row) != len(QUERY_FIELDS):
            raise ValueError(f"unexpected nvidia-smi column count: {len(row)}")
        index, model, utilization, total, used, available = (
            cell.strip() for cell in row
        )
        if not model:
            raise ValueError("nvidia-smi returned an empty GPU model")
        memory_total_mb = _optional_int(total)
        memory_used_mb = _optional_int(used)
        memory_available_mb = _optional_int(available)
        devices.append(
            {
                "index": int(index),
                "name": model,
                "model": model,
                "utilization_percent": _optional_float(utilization),
                "vram_total_bytes": (
                    memory_total_mb * MEBIBYTE
                    if memory_total_mb is not None
                    else None
                ),
                "vram_used_bytes": (
                    memory_used_mb * MEBIBYTE
                    if memory_used_mb is not None
                    else None
                ),
                "vram_available_bytes": (
                    memory_available_mb * MEBIBYTE
                    if memory_available_mb is not None
                    else None
                ),
                # Preserve the original MiB fields for older backends.
                "memory_total_mb": memory_total_mb,
                "memory_used_mb": memory_used_mb,
                "memory_available_mb": memory_available_mb,
            }
        )
    return devices


def _empty_report(*, supported: bool, error: str | None = None) -> GpuReport:
    report: GpuReport = {
        "supported": supported,
        "available": False,
        "device_count": 0,
        "total_vram_bytes": 0,
        "used_vram_bytes": 0,
        "available_vram_bytes": 0,
        "utilization_percent": None,
        "devices": [],
    }
    if error:
        report["error"] = error[:1000]
    return report


def _sum_device_bytes(devices: list[GpuDeviceReport], field: str) -> int:
    return sum(int(device.get(field) or 0) for device in devices)


def _mean_utilization(devices: list[GpuDeviceReport]) -> float | None:
    values = [
        float(device["utilization_percent"])
        for device in devices
        if device["utilization_percent"] is not None
    ]
    return round(sum(values) / len(values), 2) if values else None


def _creation_flags() -> int:
    return int(getattr(subprocess, "CREATE_NO_WINDOW", 0)) if os.name == "nt" else 0


def collect_gpu(timeout_seconds: float = 5.0) -> GpuReport:
    executable = find_nvidia_smi()
    if executable is None:
        return _empty_report(supported=False)

    command = [
        executable,
        f"--query-gpu={','.join(QUERY_FIELDS)}",
        "--format=csv,noheader,nounits",
    ]
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_seconds,
            check=False,
            creationflags=_creation_flags(),
        )
    except subprocess.TimeoutExpired:
        return _empty_report(
            supported=True,
            error="nvidia-smi collection timed out",
        )
    except OSError as exc:
        return _empty_report(
            supported=True,
            error=f"nvidia-smi could not be started: {exc}",
        )

    combined_error = (result.stderr or result.stdout).strip()
    if result.returncode != 0:
        no_device = "no devices were found" in combined_error.casefold()
        return _empty_report(
            supported=not no_device,
            error=combined_error or f"nvidia-smi exited with {result.returncode}",
        )

    try:
        devices = _parse_devices(result.stdout)
    except (TypeError, ValueError) as exc:
        return _empty_report(
            supported=True,
            error=f"invalid nvidia-smi output: {exc}",
        )

    if not devices:
        return _empty_report(supported=False)
    unified = is_unified_memory_device(devices)
    return {
        "supported": True,
        "available": True,
        "device_count": len(devices),
        "total_vram_bytes": _sum_device_bytes(devices, "vram_total_bytes"),
        "used_vram_bytes": _sum_device_bytes(devices, "vram_used_bytes"),
        "available_vram_bytes": _sum_device_bytes(
            devices, "vram_available_bytes"
        ),
        "utilization_percent": _mean_utilization(devices),
        "devices": devices,
        **({"memory_architecture": "unified"} if unified else {}),
    }


def is_unified_memory_device(devices: list[GpuDeviceReport]) -> bool:
    """Jetson/Thor GPUs share system memory, so nvidia-smi reports memory as N/A."""

    tegra = Path("/etc/nv_tegra_release").exists()
    memory_unknown = all(device.get("vram_total_bytes") is None for device in devices)
    return memory_unknown and (tegra or any("thor" in device["model"].casefold() for device in devices))
