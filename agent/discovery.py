from __future__ import annotations

import json
import logging
from collections.abc import Callable
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

logger = logging.getLogger(__name__)


class DiscoveryServer:
    def __init__(
        self,
        host: str,
        port: int,
        identity_provider: Callable[[], dict[str, object]],
    ) -> None:
        self._host = host
        self._port = port
        self._identity_provider = identity_provider
        self._server: ThreadingHTTPServer | None = None
        self._thread: Thread | None = None

    def start(self) -> None:
        provider = self._identity_provider

        class Handler(BaseHTTPRequestHandler):
            server_version = "VehicularAgentDiscovery/0.1"

            def do_GET(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
                if self.path == "/health":
                    self._write_json(HTTPStatus.OK, {"status": "ok"})
                    return
                if self.path == "/api/v1/identity":
                    try:
                        identity = provider()
                    except Exception:
                        logger.exception("identity discovery request failed")
                        self._write_json(
                            HTTPStatus.INTERNAL_SERVER_ERROR,
                            {"detail": "identity collection failed"},
                        )
                        return
                    self._write_json(HTTPStatus.OK, {"identity": identity})
                    return
                self._write_json(HTTPStatus.NOT_FOUND, {"detail": "not found"})

            def _write_json(self, status: HTTPStatus, body: dict[str, object]) -> None:
                encoded = json.dumps(body, ensure_ascii=False).encode("utf-8")
                self.send_response(status.value)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

            def log_message(self, format: str, *args: object) -> None:
                logger.debug("discovery: " + format, *args)

        self._server = ThreadingHTTPServer((self._host, self._port), Handler)
        self._server.daemon_threads = True
        self._thread = Thread(
            target=self._server.serve_forever,
            name="agent-discovery",
            daemon=True,
        )
        self._thread.start()
        logger.info("agent discovery listening on %s:%s", self._host, self._port)

    def stop(self) -> None:
        if self._server is None:
            return
        self._server.shutdown()
        self._server.server_close()
        if self._thread is not None:
            self._thread.join(timeout=3)
        self._server = None
        self._thread = None
