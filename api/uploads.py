"""Uploaded floor plans: check the file, hand it to a reader, and leave no copy behind.

In:  the uploaded file's name and bytes.  Out: whatever the reader returns for it.
A plan must be a PNG, JPG or PDF (by its name and by its first bytes) and no larger than
config.max_upload_bytes(). The reader needs a path, so the bytes go to a temporary file that is
deleted as soon as the read ends, whether it worked or failed. Nothing is stored.
"""
from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Callable, TypeVar

from . import config
from .errors import ApiError

T = TypeVar("T")
_SIGNATURES = {"image/png": b"\x89PNG\r\n\x1a\n", "image/jpeg": b"\xff\xd8\xff", "application/pdf": b"%PDF-"}


def check(filename: str, data: bytes) -> str:
    """The file's suffix if it is an allowed plan file; otherwise an ApiError the front end can show."""
    suffix = Path(filename or "").suffix.lower()
    if suffix not in config.UPLOAD_TYPES:
        raise ApiError(415, "unsupported_file_type", "The plan must be a PNG, JPG or PDF file.")
    if not data:
        raise ApiError(400, "empty_file", "The uploaded file is empty.")
    if len(data) > config.max_upload_bytes():
        raise ApiError(413, "file_too_large",
                       f"The plan is larger than the {config.max_upload_bytes() / 1024 / 1024:g} MB limit.")
    if not data.startswith(_SIGNATURES[config.UPLOAD_TYPES[suffix]]):
        raise ApiError(415, "unsupported_file_type",
                       f"The file is named {suffix} but its contents are not that kind of file. Upload a PNG, JPG or PDF.")
    return suffix


def read_and_delete(data: bytes, suffix: str, reader: Callable[[Path], T]) -> T:
    """Write the upload to a temporary file, call reader(path), and delete the file whatever happens."""
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(data)
    path = Path(f.name)
    try:
        return reader(path)
    finally:
        path.unlink(missing_ok=True)
