from __future__ import annotations

import socket
import time
from dataclasses import dataclass

import psutil

from agent.collectors.identity import detect_primary_ip
from agent.models import NetworkReport


@dataclass(frozen=True, slots=True)
class _CounterSnapshot:
    bytes_sent: int
    bytes_received: int
    sampled_at: float


def _interface_ipv4(interface_name: str) -> str | None:
    for address in psutil.net_if_addrs().get(interface_name, []):
        if address.family == socket.AF_INET and address.address:
            return address.address
    return None


def _interface_mac(interface_name: str) -> str | None:
    link_families = {
        value
        for value in (
            getattr(psutil, "AF_LINK", None),
            getattr(socket, "AF_PACKET", None),
        )
        if value is not None
    }
    for address in psutil.net_if_addrs().get(interface_name, []):
        if address.family in link_families and address.address:
            return address.address
    return None


def select_primary_interface(preferred_ip: str | None = None) -> tuple[str, str]:
    addresses = psutil.net_if_addrs()
    stats = psutil.net_if_stats()
    target_ip = preferred_ip or detect_primary_ip()

    for interface_name in addresses:
        if _interface_ipv4(interface_name) == target_ip:
            return interface_name, target_ip

    candidates: list[tuple[str, str]] = []
    for interface_name in addresses:
        ipv4 = _interface_ipv4(interface_name)
        if not ipv4 or ipv4.startswith("127."):
            continue
        if stats.get(interface_name) is not None and stats[interface_name].isup:
            candidates.append((interface_name, ipv4))
    if candidates:
        return candidates[0]

    return "unknown", target_ip or "127.0.0.1"


class NetworkCollector:
    def __init__(self) -> None:
        self._previous: dict[str, _CounterSnapshot] = {}

    def collect(self, preferred_ip: str | None = None) -> NetworkReport:
        interface_name, ipv4 = select_primary_interface(preferred_ip)
        stats = psutil.net_if_stats().get(interface_name)
        counters = psutil.net_io_counters(pernic=True).get(interface_name)
        sampled_at = time.monotonic()

        bytes_sent = int(counters.bytes_sent) if counters else 0
        bytes_received = int(counters.bytes_recv) if counters else 0
        tx_rate: float | None = None
        rx_rate: float | None = None
        previous = self._previous.get(interface_name)
        if previous is not None:
            duration = sampled_at - previous.sampled_at
            if duration > 0:
                tx_rate = max(0.0, (bytes_sent - previous.bytes_sent) / duration)
                rx_rate = max(
                    0.0, (bytes_received - previous.bytes_received) / duration
                )

        self._previous[interface_name] = _CounterSnapshot(
            bytes_sent=bytes_sent,
            bytes_received=bytes_received,
            sampled_at=sampled_at,
        )

        if stats is None:
            link_status = "UNKNOWN"
            link_speed = None
        else:
            link_status = "UP" if stats.isup else "DOWN"
            link_speed = float(stats.speed) if stats.speed and stats.speed > 0 else None

        return {
            "ip": ipv4,
            "network_interface": interface_name,
            "link_status": link_status,
            "bytes_sent": bytes_sent,
            "bytes_received": bytes_received,
            "tx_rate_bytes_per_second": (
                round(tx_rate, 1) if tx_rate is not None else None
            ),
            "rx_rate_bytes_per_second": (
                round(rx_rate, 1) if rx_rate is not None else None
            ),
            "mac_address": _interface_mac(interface_name),
            "link_speed_mbps": link_speed,
        }
