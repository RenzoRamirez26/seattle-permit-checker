"""HTTP GET with a few retries, shared by the Seattle downloads."""
from __future__ import annotations

import time

import requests

UA = {"User-Agent": "seattle-permit-checker/0.2 (student project)"}


def get(url: str, *, params=None, tries: int = 3, timeout: int = 60, stream=False) -> requests.Response:
    last = None
    for i in range(tries):
        try:
            r = requests.get(url, params=params, headers=UA, timeout=timeout, stream=stream)
            r.raise_for_status()
            return r
        except requests.RequestException as e:  # retry transient errors
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"GET failed after {tries} tries: {url}: {last}")
