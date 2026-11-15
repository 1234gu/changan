from __future__ import annotations

import ctypes
import os
from pathlib import Path
from typing import BinaryIO


class SingleInstanceLock:
    """A crash-safe OS lock that prevents duplicate node collector processes."""

    def __init__(self, device_fingerprint: str, lock_file: Path) -> None:
        digest = device_fingerprint.removeprefix("sha256:")
        if len(digest) != 64 or any(
            character not in "0123456789abcdef" for character in digest
        ):
            raise ValueError("device_fingerprint must be a sha256 digest")
        self._mutex_name = f"Global\\VehicularNodeCollector-{digest}"
        self._lock_file = lock_file
        self._handle: int | None = None
        self._file: BinaryIO | None = None

    @property
    def acquired(self) -> bool:
        return self._handle is not None or self._file is not None

    def acquire(self) -> bool:
        if self.acquired:
            return True
        if os.name == "nt":
            return self._acquire_windows_mutex()
        return self._acquire_file_lock()

    def _acquire_windows_mutex(self) -> bool:
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        create_mutex = kernel32.CreateMutexW
        create_mutex.argtypes = [ctypes.c_void_p, ctypes.c_bool, ctypes.c_wchar_p]
        create_mutex.restype = ctypes.c_void_p
        close_handle = kernel32.CloseHandle
        close_handle.argtypes = [ctypes.c_void_p]
        close_handle.restype = ctypes.c_bool

        ctypes.set_last_error(0)
        handle = create_mutex(None, False, self._mutex_name)
        if not handle:
            error = ctypes.get_last_error()
            raise OSError(error, "cannot create the node collector mutex")
        if ctypes.get_last_error() == 183:  # ERROR_ALREADY_EXISTS
            close_handle(handle)
            return False
        self._handle = int(handle)
        return True

    def _acquire_file_lock(self) -> bool:
        # Non-Windows support is useful for development and CI. The lock is owned
        # by the open descriptor, so a crash never leaves a permanent zombie lock.
        import fcntl

        self._lock_file.parent.mkdir(parents=True, exist_ok=True)
        lock_file = self._lock_file.open("a+b")
        try:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            lock_file.close()
            return False
        self._file = lock_file
        return True

    def release(self) -> None:
        if self._handle is not None:
            kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
            kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
            kernel32.CloseHandle.restype = ctypes.c_bool
            kernel32.CloseHandle(ctypes.c_void_p(self._handle))
            self._handle = None
        if self._file is not None:
            try:
                if os.name != "nt":
                    import fcntl

                    fcntl.flock(self._file.fileno(), fcntl.LOCK_UN)
            finally:
                self._file.close()
                self._file = None

    def __enter__(self) -> "SingleInstanceLock":
        if not self.acquire():
            raise RuntimeError("node collector instance is already running")
        return self

    def __exit__(self, _exc_type: object, _exc: object, _traceback: object) -> None:
        self.release()
