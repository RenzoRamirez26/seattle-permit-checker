"""Uploaded floor plans: check the file, hand it to a reader, and leave no copy behind.

In:  the uploaded file's name and bytes.  Out: whatever the reader returns for it.
A plan must be a PNG, JPG or PDF and no larger than config.max_upload_bytes(). Its type comes from its first bytes
(its "magic number"), never from its name, which is not used at all. Before anything is decoded:
- a picture's width and height are read from its header and must stay under config.max_image_pixels(), so a small
  file cannot unpack into an image that fills the server's memory (a "decompression bomb");
- a PDF must open, have at most config.max_pdf_pages() pages, and a first page no larger than a sheet a plan is
  printed on, since that page is turned into a picture.
The reader needs a path, so the bytes go to a temporary file with a random name, in the system's private temporary
folder, deleted as soon as the read ends, whether it worked or failed. Nothing is stored and nothing is served back.
"""
from __future__ import annotations

import io
import tempfile
from pathlib import Path
from typing import Callable, Optional, TypeVar

from . import config
from .errors import ApiError

T = TypeVar("T")
_SIGNATURES = {".png": b"\x89PNG\r\n\x1a\n", ".jpg": b"\xff\xd8\xff", ".pdf": b"%PDF-"}
MAX_PDF_PAGE_INCHES = 60        # an ARCH E1 sheet is 30 x 42 in; a larger first page is not a drawing sheet
TEMP_PREFIX = "permit-plan-"
NOT_A_PLAN = "We can't read this kind of file. Upload a PDF, PNG or JPG."


def kind(data: bytes) -> Optional[str]:
    """".png", ".jpg" or ".pdf" from the file's first bytes, or None."""
    return next((suffix for suffix, magic in _SIGNATURES.items() if data.startswith(magic)), None)


def _check_picture(data: bytes) -> None:
    from PIL import Image

    try:
        with Image.open(io.BytesIO(data)) as img:          # reads the header only; nothing is decoded here
            width, height = img.size
    except Image.DecompressionBombError:
        raise ApiError(413, "image_too_large", "The picture is too large to read. Upload a smaller copy, for example a "
                                               "photo of the plan.") from None
    except Exception:
        raise ApiError(415, "unsupported_file_type", NOT_A_PLAN) from None
    if width * height > config.max_image_pixels():
        raise ApiError(413, "image_too_large", "The picture is too large to read. Upload a smaller copy, for example a "
                                               "photo of the plan.")


def _check_pdf(data: bytes) -> None:
    import pypdfium2 as pdfium

    try:
        doc = pdfium.PdfDocument(data)
    except Exception:
        raise ApiError(415, "unsupported_file_type", NOT_A_PLAN) from None
    try:
        pages = len(doc)
        if pages == 0:
            raise ApiError(415, "unsupported_file_type", NOT_A_PLAN)
        if pages > config.max_pdf_pages():
            raise ApiError(413, "too_many_pages", f"The PDF has {pages} pages. Upload only the floor plan page, or a PDF "
                                                  f"of up to {config.max_pdf_pages()} pages.")
        width, height = doc[0].get_size()                  # in points, 72 to the inch
        if max(width, height) > MAX_PDF_PAGE_INCHES * 72:
            raise ApiError(413, "image_too_large", "The plan's page is too large to read. Export the floor plan on a "
                                                   "standard sheet size, or upload a photo of it.")
    finally:
        doc.close()


def check(filename: str, data: bytes) -> str:
    """The suffix for the file's real type (".png", ".jpg" or ".pdf") if it is a plan we can read; otherwise an ApiError
    the front end can show. The filename is accepted for the caller's convenience and ignored."""
    del filename
    if not data:
        raise ApiError(400, "empty_file", "The uploaded file is empty.")
    if len(data) > config.max_upload_bytes():
        raise ApiError(413, "file_too_large",
                       f"The plan is larger than the {config.max_upload_bytes() / 1024 / 1024:g} MB limit.")
    suffix = kind(data)
    if suffix is None:
        raise ApiError(415, "unsupported_file_type", NOT_A_PLAN)
    if suffix == ".pdf":
        _check_pdf(data)
    else:
        _check_picture(data)
    return suffix


def read_and_delete(data: bytes, suffix: str, reader: Callable[[Path], T]) -> T:
    """Write the upload to a temporary file with a random name, call reader(path), and delete the file whatever happens."""
    with tempfile.NamedTemporaryFile(prefix=TEMP_PREFIX, suffix=suffix, delete=False) as f:     # mode 0600
        path = Path(f.name)
        try:
            f.write(data)
        except BaseException:
            f.close()
            path.unlink(missing_ok=True)
            raise
    try:
        return reader(path)
    finally:
        path.unlink(missing_ok=True)
