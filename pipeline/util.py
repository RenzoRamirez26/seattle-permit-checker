from __future__ import annotations

import datetime as dt
import re
from typing import Optional

_FORMATS = ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%Y/%m/%d")


def parse_date(s: Optional[str]) -> Optional[str]:
    """Return ISO date (YYYY-MM-DD) from common US/ISO date strings, else None."""
    if not s:
        return None
    token = re.split(r"[ T]", str(s).strip())[0]
    for fmt in _FORMATS:
        try:
            return dt.datetime.strptime(token, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def num(v) -> Optional[float]:
    if v in (None, ""):
        return None
    try:
        return float(str(v).replace("$", "").replace(",", "").strip())
    except ValueError:
        return None
