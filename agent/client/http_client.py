from __future__ import annotations

import os
from typing import Any

import requests

from agent import __version__


class BackendRequestError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class BackendClient:
    def __init__(self, base_url: str, timeout_seconds: float) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout_seconds = timeout_seconds
        self._session = requests.Session()
        # Agents talk to a LAN backend; inherited desktop proxy settings can break that path.
        self._session.trust_env = False
        self._session.headers.update(
            {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": f"vehicular-node-agent/{__version__}",
            }
        )
        # Reporting credential issued by the platform; never logged or persisted here.
        token = os.environ.get("CHANGAN_POOL_AGENT_TOKEN", "").strip()
        if token:
            self._session.headers["X-Pool-Agent-Token"] = token

    def get(self, path: str) -> dict[str, Any]:
        return self._request("GET", path)

    def post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", path, payload)

    def _request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        url = f"{self._base_url}{path}"
        try:
            response = self._session.request(
                method,
                url,
                json=payload if method != "GET" else None,
                timeout=self._timeout_seconds,
            )
        except requests.Timeout as exc:
            raise BackendRequestError(f"backend request timed out: {exc}") from exc
        except requests.ConnectionError as exc:
            raise BackendRequestError(f"backend connection failed: {exc}") from exc
        except requests.RequestException as exc:
            raise BackendRequestError(f"backend request failed: {exc}") from exc

        if not response.ok:
            detail = response.text.strip()
            try:
                body = response.json()
                if isinstance(body, dict) and isinstance(body.get("detail"), str):
                    detail = body["detail"]
            except ValueError:
                pass
            raise BackendRequestError(
                detail[:1000] or f"backend returned HTTP {response.status_code}",
                status_code=response.status_code,
            )
        try:
            body = response.json()
        except ValueError as exc:
            raise BackendRequestError("backend returned invalid JSON") from exc
        if not isinstance(body, dict):
            raise BackendRequestError("backend returned an unexpected JSON shape")
        return body

    def health_check(self) -> dict[str, Any]:
        body = self.get("/health")
        if str(body.get("status", "")).casefold() != "ok":
            raise BackendRequestError("backend health endpoint did not return status=ok")
        return body

    def close(self) -> None:
        self._session.close()
