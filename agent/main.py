from __future__ import annotations

import argparse
import logging
import signal
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path
from threading import Event, Lock, Thread
from uuid import UUID

# Support both `python -m agent.main` and `cd agent; python main.py`.
if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent import __version__
from agent.client.heartbeat import send_heartbeat
from agent.client.http_client import BackendClient, BackendRequestError
from agent.client.register import register_node
from agent.client.reporter import report_resources
from agent.collectors.identity import (
    collect_device_fingerprint,
    collect_identity,
    load_or_create_node_id,
    persist_node_id,
)
from agent.collectors.resources import ResourceCollector
from agent.config import (
    AgentConfig,
    AgentConfigurationError,
    application_dir,
    load_config,
    save_config,
)
from agent.discovery import DiscoveryServer
from agent.models import IdentityPayload
from agent.single_instance import SingleInstanceLock

logger = logging.getLogger("vehicular-agent")


class AgentRuntime:
    def __init__(
        self,
        config: AgentConfig,
        node_id: UUID,
        device_fingerprint: str,
    ) -> None:
        self._config = config
        self._node_id = node_id
        self._device_fingerprint = device_fingerprint
        self._identity_lock = Lock()
        self._stop = Event()
        self._known_to_backend = Event()
        self._threads: list[Thread] = []

    def identity(self) -> IdentityPayload:
        with self._identity_lock:
            node_id = self._node_id
        return collect_identity(node_id, self._config.advertise_ip)

    def discovery_identity(self) -> dict[str, object]:
        """Identity exposed to the Backend during manual connect.

        The hashed fingerprint is included so the Backend can recognise an
        already-registered physical device even when the agent state file was
        lost and a fresh local node UUID was generated.
        """

        identity: dict[str, object] = dict(self.identity())
        identity["device_fingerprint"] = self._device_fingerprint
        return identity

    def current_node_id(self) -> UUID:
        with self._identity_lock:
            return self._node_id

    def _adopt_canonical_node_id(self, response: dict[str, object]) -> None:
        raw_canonical = response.get("canonical_node_id")
        if raw_canonical is None or raw_canonical == "":
            return
        try:
            canonical_node_id = UUID(str(raw_canonical))
        except (TypeError, ValueError) as exc:
            raise RuntimeError("backend returned an invalid canonical_node_id") from exc

        with self._identity_lock:
            if canonical_node_id == self._node_id:
                return
            # Persist first so an interrupted process cannot continue later with
            # the superseded locally generated UUID.
            persist_node_id(self._config.state_file, canonical_node_id)
            self._node_id = canonical_node_id
        logger.info("检测到历史设备身份，已恢复原节点ID：%s", canonical_node_id)

    def start(self) -> None:
        workers = (
            ("agent-registration", self._registration_loop),
            ("agent-heartbeat", self._heartbeat_loop),
            ("agent-resource-report", self._resource_loop),
        )
        for name, target in workers:
            thread = Thread(target=target, name=name, daemon=True)
            thread.start()
            self._threads.append(thread)

    def stop(self) -> None:
        self._stop.set()
        self._known_to_backend.set()
        for thread in self._threads:
            thread.join(timeout=10)

    def wait(self) -> None:
        while not self._stop.wait(1):
            pass

    def _new_client(self) -> BackendClient:
        return BackendClient(
            self._config.backend.url,
            self._config.backend.request_timeout_seconds,
        )

    def _registration_loop(self) -> None:
        client = self._new_client()
        delay = self._config.reconnect_interval_seconds
        try:
            while not self._stop.is_set():
                if self._known_to_backend.is_set():
                    self._stop.wait(0.5)
                    continue
                try:
                    response = register_node(
                        client,
                        self._config,
                        self.identity(),
                        self._device_fingerprint,
                    )
                    self._adopt_canonical_node_id(response)
                    registration_status = response.get("registration_status", "UNKNOWN")
                    runtime_status = response.get("runtime_status", "UNKNOWN")
                    logger.info(
                        "registered with backend: registration=%s runtime=%s",
                        registration_status,
                        runtime_status,
                    )
                    self._known_to_backend.set()
                    delay = self._config.reconnect_interval_seconds
                except BackendRequestError as exc:
                    logger.warning("backend registration unavailable: %s", exc)
                    self._stop.wait(delay)
                    delay = min(delay * 2, self._config.reconnect_max_interval_seconds)
                except Exception:
                    logger.exception("unexpected registration failure")
                    self._stop.wait(delay)
                    delay = min(delay * 2, self._config.reconnect_max_interval_seconds)
        finally:
            client.close()

    def _wait_for_backend(self) -> bool:
        while not self._stop.is_set():
            if self._known_to_backend.wait(timeout=0.5):
                return not self._stop.is_set()
        return False

    def _handle_delivery_error(self, operation: str, exc: BackendRequestError) -> None:
        logger.warning("%s failed: %s", operation, exc)
        if exc.status_code is None or exc.status_code == 404:
            self._known_to_backend.clear()

    def _heartbeat_loop(self) -> None:
        client = self._new_client()
        try:
            while not self._stop.is_set():
                if not self._wait_for_backend():
                    break
                try:
                    response = send_heartbeat(client, str(self.current_node_id()))
                    logger.debug(
                        "heartbeat accepted: runtime=%s schedulable=%s",
                        response.get("runtime_status"),
                        response.get("schedulable"),
                    )
                except BackendRequestError as exc:
                    self._handle_delivery_error("heartbeat", exc)
                except Exception:
                    logger.exception("unexpected heartbeat failure")
                self._stop.wait(self._config.heartbeat_interval_seconds)
        finally:
            client.close()

    def _resource_loop(self) -> None:
        client = self._new_client()
        collector = ResourceCollector()
        try:
            while not self._stop.is_set():
                if not self._wait_for_backend():
                    break
                try:
                    identity = self.identity()
                    report = collector.collect(preferred_ip=identity["ip"])
                    response = report_resources(
                        client,
                        str(self.current_node_id()),
                        report,
                    )
                    logger.info(
                        "resource report accepted: runtime=%s schedulable=%s",
                        response.get("runtime_status"),
                        response.get("schedulable"),
                    )
                except BackendRequestError as exc:
                    self._handle_delivery_error("resource report", exc)
                except Exception:
                    logger.exception(
                        "resource collection/report failed; heartbeat remains active"
                    )
                self._stop.wait(self._config.resource_report_interval_seconds)
        finally:
            client.close()


def _parse_arguments(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Vehicular compute node agent")
    parser.add_argument(
        "--config",
        default=None,
        help="optional legacy YAML configuration (development mode)",
    )
    parser.add_argument(
        "--server",
        help="Backend URL to validate, save, and use",
    )
    parser.add_argument(
        "--configure",
        action="store_true",
        help="reconfigure and save the Backend URL, then exit",
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="show local Agent status without starting runtime loops",
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {__version__}",
    )
    return parser.parse_args(argv)


def _configure_logging(level: str, log_file: Path) -> None:
    numeric_level = getattr(logging, level.upper(), logging.INFO)
    formatter = logging.Formatter(
        "%(asctime)s %(levelname)s %(threadName)s %(name)s: %(message)s"
    )
    root = logging.getLogger()
    root.setLevel(numeric_level)
    if not root.handlers:
        console = logging.StreamHandler()
        console.setFormatter(formatter)
        root.addHandler(console)
    try:
        log_file.parent.mkdir(parents=True, exist_ok=True)
        resolved_log = log_file.resolve()
        if not any(
            isinstance(handler, RotatingFileHandler)
            and Path(handler.baseFilename).resolve() == resolved_log
            for handler in root.handlers
        ):
            file_handler = RotatingFileHandler(
                log_file,
                maxBytes=2 * 1024 * 1024,
                backupCount=3,
                encoding="utf-8",
            )
            file_handler.setFormatter(formatter)
            root.addHandler(file_handler)
    except OSError as exc:
        logger.warning("cannot open Agent log file %s: %s", log_file, exc)


def _check_backend(config: AgentConfig) -> tuple[bool, str | None]:
    client = BackendClient(
        config.backend.url,
        config.backend.request_timeout_seconds,
    )
    try:
        client.health_check()
        return True, None
    except BackendRequestError as exc:
        return False, str(exc)
    finally:
        client.close()


def _is_interactive() -> bool:
    return bool(sys.stdin is not None and sys.stdin.isatty())


def _prompt_backend_url(
    current: str | None = None,
    *,
    retry: bool = False,
) -> str | None:
    if not _is_interactive():
        raise AgentConfigurationError(
            "Agent configuration missing in non-interactive mode. "
            "Use --server, BACKEND_URL, or --configure from a terminal."
        )
    if retry:
        print()
        print("重新输入管理中心地址")
        print("或")
        print("输入 q 退出")
    else:
        print("=" * 36)
        print("车群算力节点接入程序")
        print("=" * 36)
        if current:
            print(f"当前管理中心：{current}")
            print("请输入新的管理中心地址：")
        else:
            print("请输入管理中心地址：")
        print("输入 q 退出")
    value = input("> ").strip()
    return None if value.casefold() == "q" else value


def _print_backend_failure(address: str, reason: object) -> None:
    print("[FAIL] 无法连接管理中心", file=sys.stderr, flush=True)
    print(f"地址：{address or '(empty)'}", file=sys.stderr, flush=True)
    print(f"原因：{reason}", file=sys.stderr, flush=True)


def _interactive_configuration(
    arguments: argparse.Namespace,
    *,
    current: str | None = None,
    initial_candidate: str | None = None,
) -> AgentConfig | None:
    candidate = initial_candidate
    retry = False
    while True:
        if candidate is None:
            candidate = _prompt_backend_url(current, retry=retry)
            if candidate is None:
                return None

        try:
            config = load_config(
                arguments.config,
                cli_backend_url=candidate,
            )
        except AgentConfigurationError as exc:
            _print_backend_failure(candidate, exc)
            candidate = None
            retry = True
            continue

        _configure_logging(config.log_level, config.log_file)
        print("正在检测管理中心...", flush=True)
        connected, health_error = _check_backend(config)
        if not connected:
            _print_backend_failure(config.backend.url, health_error or "unknown error")
            logger.warning(
                "interactive backend validation failed for %s: %s",
                config.backend.url,
                health_error,
            )
            candidate = None
            retry = True
            continue

        print("[OK] 管理中心连接成功", flush=True)
        try:
            save_config(config)
        except AgentConfigurationError as exc:
            _print_backend_failure(config.backend.url, exc)
            logger.exception("interactive Agent configuration could not be saved")
            candidate = None
            retry = True
            continue
        print("[OK] 配置已保存", flush=True)
        return config


def _load_for_cli(
    arguments: argparse.Namespace,
) -> tuple[AgentConfig | None, bool, bool]:
    """Return config, whether it needs saving, and whether health is verified."""

    if arguments.status:
        return (
            load_config(
                arguments.config,
                cli_backend_url=arguments.server,
            ),
            False,
            False,
        )

    if arguments.configure:
        current: str | None = None
        try:
            current = load_config(arguments.config).backend.url
        except AgentConfigurationError:
            pass
        if _is_interactive():
            return (
                _interactive_configuration(
                    arguments,
                    current=current,
                    initial_candidate=arguments.server,
                ),
                False,
                True,
            )
        if not arguments.server:
            raise AgentConfigurationError(
                "--configure requires --server in non-interactive mode"
            )
        return (
            load_config(arguments.config, cli_backend_url=arguments.server),
            True,
            False,
        )

    if arguments.server:
        if _is_interactive():
            return (
                _interactive_configuration(
                    arguments,
                    initial_candidate=arguments.server,
                ),
                False,
                True,
            )
        return (
            load_config(arguments.config, cli_backend_url=arguments.server),
            True,
            False,
        )

    try:
        return load_config(arguments.config), False, False
    except AgentConfigurationError:
        if not _is_interactive():
            raise
        return (
            _interactive_configuration(arguments),
            False,
            True,
        )


def _read_node_id(state_file: Path) -> str:
    try:
        value = state_file.read_text(encoding="utf-8").strip()
        return str(UUID(value))
    except FileNotFoundError:
        return "(not created)"
    except (OSError, ValueError):
        return "(invalid)"


def _show_status(config: AgentConfig) -> int:
    identity = collect_identity(
        UUID(_read_node_id(config.state_file))
        if _read_node_id(config.state_file) not in {"(not created)", "(invalid)"}
        else UUID(int=0),
        config.advertise_ip,
    )
    connected, error = _check_backend(config)
    print(f"Node ID: {_read_node_id(config.state_file)}")
    print(f"Backend URL: {config.backend.url}")
    print(f"Hostname: {identity['hostname']}")
    print(f"Architecture: {identity['architecture']}")
    print(f"Backend connection: {'OK' if connected else 'FAIL'}")
    if error:
        print(f"Reason: {error}")
    return 0


def _validate_backend_and_save(config: AgentConfig, should_save: bool) -> bool:
    print("正在检测管理中心...", flush=True)
    connected, health_error = _check_backend(config)
    if connected:
        print("[OK] 管理中心连接成功", flush=True)
    else:
        _print_backend_failure(
            config.backend.url,
            health_error or "unknown error",
        )
        if should_save:
            return False
        logger.warning(
            "initial backend health check failed; runtime retry remains enabled: %s",
            health_error,
        )

    if should_save:
        try:
            save_config(config)
        except AgentConfigurationError as exc:
            _print_backend_failure(config.backend.url, exc)
            logger.exception("Agent configuration could not be saved")
            return False
        print("[OK] 配置已保存", flush=True)
    return True


def _run_collector(
    config: AgentConfig,
    node_id: UUID,
    device_fingerprint: str,
) -> int:
    runtime = AgentRuntime(config, node_id, device_fingerprint)
    discovery: DiscoveryServer | None = None
    if config.discovery.enabled:
        discovery = DiscoveryServer(
            config.discovery.listen_host,
            config.discovery.port,
            runtime.discovery_identity,
        )
        try:
            discovery.start()
        except OSError:
            logger.exception(
                "agent discovery could not start; automatic registration will continue"
            )
            discovery = None

    def request_stop(signum: int, _frame: object) -> None:
        logger.info("received signal %s; stopping agent", signum)
        runtime.stop()

    for signal_name in ("SIGINT", "SIGTERM"):
        signal_value = getattr(signal, signal_name, None)
        if signal_value is not None:
            signal.signal(signal_value, request_stop)

    logger.info(
        "starting node agent node_id=%s backend=%s",
        node_id,
        config.backend.url,
    )
    identity = runtime.identity()
    print("Vehicular Node Agent")
    print(f"Node ID: {node_id}")
    print(f"Hostname: {identity['hostname']}")
    print(f"Architecture: {identity['architecture']}")
    print(f"Backend: {config.backend.url}")
    print("Registration / heartbeat / resource reporting started")
    runtime.start()
    try:
        runtime.wait()
    except KeyboardInterrupt:
        logger.info("keyboard interrupt received; stopping agent")
    finally:
        runtime.stop()
        if discovery is not None:
            discovery.stop()
    return 0


def _print_startup_error(detail: object) -> None:
    print("[ERROR] Agent启动失败", file=sys.stderr, flush=True)
    print(str(detail), file=sys.stderr, flush=True)


def _pause_before_exit() -> None:
    if not _is_interactive():
        return
    try:
        input("按 Enter 键退出...")
    except (EOFError, OSError):
        pass


def _ensure_exception_logging() -> None:
    if any(isinstance(handler, RotatingFileHandler) for handler in logging.getLogger().handlers):
        return
    _configure_logging(
        "INFO",
        application_dir() / ".state" / "logs" / "agent.log",
    )


def run(argv: list[str] | None = None) -> int:
    arguments = _parse_arguments(argv)
    try:
        config, should_save, backend_ready = _load_for_cli(arguments)
    except AgentConfigurationError as exc:
        _print_startup_error(f"Agent configuration error: {exc}")
        return 2

    if config is None:
        print("已取消配置。")
        return 0

    _configure_logging(config.log_level, config.log_file)

    if arguments.status:
        return _show_status(config)

    if arguments.configure:
        if not backend_ready and not _validate_backend_and_save(config, should_save):
            return 2
        print(f"Backend URL: {config.backend.url}")
        return 0

    if backend_ready:
        print("正在注册节点...", flush=True)

    try:
        device_fingerprint = collect_device_fingerprint()
    except RuntimeError as exc:
        logger.error("%s", exc)
        _print_startup_error(exc)
        return 2

    instance_lock = SingleInstanceLock(
        device_fingerprint,
        config.state_file.with_name("node_collector.lock"),
    )
    try:
        acquired = instance_lock.acquire()
    except OSError as exc:
        logger.exception("无法创建节点侧采集程序单实例锁")
        _print_startup_error(exc)
        return 2
    if not acquired:
        message = "该设备已有节点采集实例正在运行，请先关闭现有实例。"
        logger.error("%s", message)
        _print_startup_error(message)
        return 3

    try:
        try:
            node_id = load_or_create_node_id(config.state_file)
        except RuntimeError as exc:
            logger.error("%s", exc)
            _print_startup_error(exc)
            return 2
        # Identity is intentionally collected before the initial health check;
        # the same stable identity is then used by the single runtime.
        collect_identity(node_id, config.advertise_ip)
        if not backend_ready:
            if not _validate_backend_and_save(config, should_save):
                return 2
            print("正在注册节点...", flush=True)
        return _run_collector(config, node_id, device_fingerprint)
    finally:
        instance_lock.release()


def main(argv: list[str] | None = None) -> int:
    """Top-level guard used by source and PyInstaller entry points."""

    try:
        exit_code = run(argv)
    except SystemExit as exc:
        exit_code = int(exc.code) if isinstance(exc.code, int) else 1
        if exit_code != 0:
            _print_startup_error(
                f"command line parsing failed (exit code {exit_code})"
            )
            _pause_before_exit()
        return exit_code
    except KeyboardInterrupt:
        logger.info("Agent startup interrupted by user")
        return 130
    except Exception as exc:
        try:
            _ensure_exception_logging()
            logger.exception("unhandled Agent startup failure")
        except Exception:
            pass
        _print_startup_error(f"{type(exc).__name__}: {exc}")
        _pause_before_exit()
        return 1

    if exit_code != 0:
        _pause_before_exit()
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
