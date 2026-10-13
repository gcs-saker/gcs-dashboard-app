from __future__ import annotations

import os
from pathlib import Path

MAX_SECRET_FILE_BYTES = 4096


class SecretFileError(RuntimeError):
    pass


def read_secret_input(value_name: str, file_name: str, default_file: Path) -> str | None:
    environment_value = os.getenv(value_name, "").strip()
    configured_file = os.getenv(file_name, "").strip()
    secret_file = resolve_secret_file(configured_file, default_file)
    if environment_value and secret_file is not None:
        raise SecretFileError(f"{value_name} and {file_name} cannot both be configured")
    if environment_value or secret_file is None:
        return None
    return read_secret_file(secret_file, file_name)


def resolve_secret_file(configured_file: str, default_file: Path) -> Path | None:
    if not configured_file:
        return default_file if default_file.is_file() else None
    secret_file = Path(configured_file)
    if not secret_file.is_absolute() or not secret_file.is_file():
        raise SecretFileError(f"{configured_file} must reference an existing absolute file")
    return secret_file


def read_secret_file(secret_file: Path, file_name: str) -> str:
    if secret_file.stat().st_size > MAX_SECRET_FILE_BYTES:
        raise SecretFileError(f"{file_name} exceeds the size limit")
    try:
        value = secret_file.read_text(encoding="utf-8").strip()
    except UnicodeError as exc:
        raise SecretFileError(f"{file_name} must contain UTF-8 text") from exc
    except OSError as exc:
        raise SecretFileError(f"{file_name} cannot be read") from exc
    if not value:
        raise SecretFileError(f"{file_name} must not be empty")
    return value
