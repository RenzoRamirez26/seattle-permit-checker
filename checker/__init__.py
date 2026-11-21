"""The checker: read a floor plan, apply Seattle's rules, answer questions about the result."""
from pathlib import Path

try:  # keys in a local .env file (never committed), so the command-line tools see them too
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass
