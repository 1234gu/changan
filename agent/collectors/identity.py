from __future__ import annotations

import hashlib
import os
import platform
import shutil
import socket
import subprocess
from pathlib import Path
from uuid import UUID, uuid4

from agent import __version__
from agent.models import IdentityPayload


_INVALID_STABLE_IDENTIFIERS = {
    "",
    "0",
    "00000000-0000-0000-0000-000000000000",
    "ffffffff-ffff-ffff-ffff-ffffffffffff",
    "default string",
    "none",
    "not applicable",
    "not available",
    "system serial number",
    "to be filled by o.e.m.",
    "unknown",
}
_LINUX_MACHINE_ID_PATHS = (
    Path("/etc/machine-id"),
    Path("/var/lib/dbus/machine-id"),
)
_LINUX_PRODUCT_UUID_PATH = Path("/sys/class/dmi/id/product_uuid")


def persist_node_id(state_file: Path, node_id: UUID) -> None:
    """Persist a canonical node UUID with an atomic replacement."""

    temporary = state_file.with_name(f".{state_file.name}.{os.getpid()}.tmp")
    try:
        state_file.parent.mkdir(parents=True, exist_ok=True)
        temporary.write_text(f"{node_id}\n", encoding="utf-8")
        os.replace(temporary, state_file)
    except OSError as exc:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass
        raise RuntimeError(f"cannot persist node identity file: {state_file}") from exc


def load_or_create_node_id(state_file: Path) -> UUID:
    """Load a stable UUID, creating it atomically on first start."""

    try:
        existing = state_file.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        existing = ""
    except OSError as exc:
        raise RuntimeError(f"cannot read node identity file: {state_file}") from exc

    if existing:
        try:
            return UUID(existing)
        except ValueError as exc:
            raise RuntimeError(
                f"invalid UUID in node identity file: {state_file}"
            ) from exc

    node_id = uuid4()
    persist_node_id(state_file, node_id)
    return node_id


def _normalize_stable_identifier(value: object) -> str | None:
    normalized = str(value or "").strip().strip("{}\"").casefold()
    if normalized in _INVALID_STABLE_IDENTIFIERS:
        return None
    return normalized


def _read_windows_machine_guid() -> str | None:
    if os.name != "nt":
        return None
    try:
        import winreg

        access = winreg.KEY_READ
        access |= int(getattr(winreg, "KEY_WOW64_64KEY", 0))
        with winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Cryptography",
            0,
            access,
        ) as key:
            value, _value_type = winreg.QueryValueEx(key, "MachineGuid")
    except (ImportError, OSError):
        return None
    return _normalize_stable_identifier(value)


def _find_windows_powershell() -> str | None:
    located = shutil.which("powershell.exe") or shutil.which("powershell")
    if located:
        return located
    if os.name != "nt":
        return None
    system_root = Path(os.environ.get("SystemRoot", r"C:\Windows"))
    candidate = (
        system_root
        / "System32"
        / "WindowsPowerShell"
        / "v1.0"
        / "powershell.exe"
    )
    return str(candidate) if candidate.is_file() else None


def _read_windows_system_uuid(timeout_seconds: float = 5.0) -> str | None:
    """Read the SMBIOS UUID without ever logging or returning it to the backend."""

    if os.name != "nt":
        return None
    executable = _find_windows_powershell()
    if executable is None:
        return None
    command = [
        executable,
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID",
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
            creationflags=int(getattr(subprocess, "CREATE_NO_WINDOW", 0)),
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0:
        return None
    for line in result.stdout.splitlines():
        value = _normalize_stable_identifier(line)
        if value is not None:
            return value
    return None


def _read_stable_identifier_file(path: Path) -> str | None:
    try:
        value = path.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return _normalize_stable_identifier(value)


def _read_linux_machine_id() -> str | None:
    """Read the systemd /etc/machine-id (stable per Linux installation)."""

    if platform.system().casefold() != "linux":
        return None
    for candidate in _LINUX_MACHINE_ID_PATHS:
        normalized = _read_stable_identifier_file(candidate)
        if normalized is not None:
            return normalized
    return None


def _read_linux_product_uuid() -> str | None:
    """Read the SMBIOS product UUID exposed by sysfs on Linux."""

    if platform.system().casefold() != "linux":
        return None
    return _read_stable_identifier_file(_LINUX_PRODUCT_UUID_PATH)


def build_device_fingerprint(
    machine_guid: str | None,
    system_uuid: str | None,
    machine_id: str | None = None,
    product_uuid: str | None = None,
) -> str:
    """Hash all available stable machine identifiers into an opaque identity."""

    components: list[str] = []
    for label, value in (
        ("machine_guid", machine_guid),
        ("system_uuid", system_uuid),
        ("machine_id", machine_id),
        ("product_uuid", product_uuid),
    ):
        normalized = _normalize_stable_identifier(value)
        if normalized is not None:
            components.append(f"{label}={normalized}")
    if not components:
        raise RuntimeError(
            "无法读取稳定的设备标识（Windows MachineGuid / SMBIOS UUID / "
            "Linux machine-id / product_uuid），无法生成稳定设备指纹"
        )
    digest = hashlib.sha256("\n".join(components).encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


def collect_device_fingerprint() -> str:
    """Return an opaque, stable physical-device identity for registration."""

    return build_device_fingerprint(
        _read_windows_machine_guid(),
        _read_windows_system_uuid(),
        _read_linux_machine_id(),
        _read_linux_product_uuid(),
    )


def normalize_architecture(value: str) -> str:
    architecture = value.strip().lower()
    if architecture in {"amd64", "x64", "x86_64"}:
        return "x86_64"
    if architecture in {"arm64", "aarch64"}:
        return "arm64"
    return architecture or "unknown"


def detect_primary_ip() -> str:
    """Find the preferred local IPv4 address without sending network traffic."""

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("192.0.2.1", 9))
        candidate = sock.getsockname()[0]
        if candidate and not candidate.startswith("127."):
            return candidate
    except OSError:
        pass
    finally:
        sock.close()

    try:
        addresses = socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
    except socket.gaierror:
        addresses = []
    for address in addresses:
        candidate = address[4][0]
        if candidate and not candidate.startswith("127."):
            return candidate
    return "127.0.0.1"


def collect_identity(node_id: UUID, ip_address: str | None = None) -> IdentityPayload:
    hostname = socket.gethostname() or platform.node() or "unknown-host"
    return {
        "node_id": str(node_id),
        "hostname": hostname,
        "architecture": normalize_architecture(platform.machine()),
        "operating_system": platform.system() or "Unknown",
        "os_version": platform.version() or platform.release() or "unknown",
        "agent_version": __version__,
        "ip": ip_address or detect_primary_ip(),
        **machine_id_digest(),
    }


def machine_id_digest() -> dict[str, str]:
    """Hash of the Linux machine-id, matching Kubernetes nodeInfo.machineID.

    Only the digest leaves the device; the platform hashes the K3s value the
    same way to bind this Agent to its execution node without guessing by IP.
    """

    machine_id = _read_linux_machine_id()
    if machine_id is None:
        return {}
    return {"machine_id_sha256": hashlib.sha256(machine_id.encode("utf-8")).hexdigest()}
