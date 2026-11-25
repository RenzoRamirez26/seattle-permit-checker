"""Recorded questions in the formats browsers record, turned into the WAV that checker/voice.py reads.

In:  the bytes of one recording and the content type the browser sent: audio/webm (Chrome, Edge, Firefox),
     audio/mp4 (Safari), audio/ogg (Firefox), or audio/wav (the Streamlit app, older clients).
Out: kind(content_type, data) names the format, or None when the type is not one of these or the bytes do not
     match it. to_wav(data, kind) returns 16 kHz mono 16-bit WAV, converted with ffmpeg; a WAV is returned as is.

Privacy: ffmpeg reads and writes files, so a WebM, MP4 or Ogg recording is written to a new private temporary folder
only while it is converted, and the folder is deleted before to_wav returns, whether or not the conversion worked.
Nothing is logged. The WAV is passed to checker.voice.transcribe() in memory and dropped after the request.
ffmpeg is used here only, in the API layer; checker/ is unchanged.
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

# The formats the website records (in its order of preference), plus WAV.
KINDS = {"audio/webm": "webm", "audio/mp4": "mp4", "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-wav": "wav",
         "audio/wave": "wav"}
SUFFIX = {"webm": ".webm", "mp4": ".mp4", "ogg": ".ogg"}
DEMUXER = {"webm": "matroska", "mp4": "mov", "ogg": "ogg"}     # ffmpeg's input format for each kind
MAX_SECONDS = 35                # a little over the 30 seconds the browser records
WAV_RATE = 16000
CONVERT_SECONDS = 30            # a 30-second question converts in well under a second
TEMP_PREFIX = "permit-audio-"


class Unreadable(Exception):
    """ffmpeg could not read the recording."""


def ffmpeg() -> Optional[str]:
    """The ffmpeg program, or None when it is not installed."""
    return shutil.which("ffmpeg")


def _matches(kind: str, data: bytes) -> bool:
    """The file's first bytes agree with its content type."""
    if kind == "wav":
        return data[:4] == b"RIFF" and data[8:12] == b"WAVE"
    if kind == "webm":
        return data[:4] == b"\x1a\x45\xdf\xa3"            # EBML header (Matroska / WebM)
    if kind == "mp4":
        return data[4:8] == b"ftyp"
    if kind == "ogg":
        return data[:4] == b"OggS"
    return False


def kind(content_type: str, data: bytes) -> Optional[str]:
    """"webm", "mp4", "ogg" or "wav" when the content type is one of the accepted ones (codecs parameters allowed)
    and the bytes match it; otherwise None."""
    base = (content_type or "").split(";")[0].strip().lower()
    k = KINDS.get(base)
    return k if k and _matches(k, data) else None


def to_wav(data: bytes, k: str) -> bytes:
    """16 kHz mono WAV from a recording of kind k. Raises Unreadable when ffmpeg cannot read it, and
    FileNotFoundError when ffmpeg is not installed. The temporary folder is always deleted."""
    if k == "wav":
        return data
    exe = ffmpeg()
    if not exe:
        raise FileNotFoundError("ffmpeg")
    with tempfile.TemporaryDirectory(prefix=TEMP_PREFIX) as folder:      # mode 0700, removed on exit
        src, out = Path(folder) / f"in{SUFFIX[k]}", Path(folder) / "out.wav"
        src.write_bytes(data)
        try:
            # The demuxer is named (never guessed from the bytes), ffmpeg may open local files only, and the output is
            # cut at MAX_SECONDS, so a small clip cannot turn into a long transcription.
            done = subprocess.run([exe, "-nostdin", "-hide_banner", "-loglevel", "error", "-protocol_whitelist", "file",
                                   "-f", DEMUXER[k], "-i", str(src), "-t", str(MAX_SECONDS),
                                   "-ac", "1", "-ar", str(WAV_RATE), "-sample_fmt", "s16", "-f", "wav", str(out)],
                                  capture_output=True, timeout=CONVERT_SECONDS, check=False)
        except subprocess.TimeoutExpired as e:
            raise Unreadable("conversion took too long") from e
        if done.returncode != 0 or not out.exists() or out.stat().st_size <= 44:
            raise Unreadable("ffmpeg could not read the recording")
        return out.read_bytes()
