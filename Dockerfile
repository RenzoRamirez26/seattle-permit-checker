# The PermitOS API (api/) as one container, for a host such as Render, Railway or Fly. The host terminates HTTPS and
# redirects HTTP to it; this image serves plain HTTP on $PORT behind it. See docs/launch.md.
#
#   docker build -t permitos-api .
#   docker run --rm -p 8000:8000 -e ANTHROPIC_API_KEY=... -e PERMIT_CORS_ORIGIN=https://your-site.example permitos-api
#
# Inside: Python 3.13, ffmpeg (browser recordings to WAV), faster-whisper with its base.en model already downloaded
# (no download at run time), checker/, pipeline/, api/, the demo plans, and data/permits.sqlite if it was built
# before `docker build` (python -m pipeline.run_pipeline --seattle). No key is baked in: set it on the host.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHON_DOTENV_DISABLED=1 \
    PERMIT_ENV=production \
    PERMIT_STT=faster-whisper \
    PERMIT_STT_MODEL=base.en \
    PERMIT_TTS=browser \
    PERMIT_CHECKS_DB=/data/checks.sqlite \
    PERMIT_SEATTLE_DB=/app/data/permits.sqlite \
    HF_HOME=/opt/models/hf \
    PORT=8000

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements-api.txt requirements-voice.txt ./
# The API's packages, plus only the speech-to-text pins from requirements-voice.txt (not Kokoro: answers are read
# aloud by the browser).
RUN pip install -r requirements-api.txt \
 && grep -E '^(faster-whisper|av)==' requirements-voice.txt | sed 's/ *#.*//' > /tmp/stt.txt \
 && pip install -r /tmp/stt.txt \
 && rm /tmp/stt.txt
# Download the speech model at build time, then forbid downloads at run time.
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('base.en', device='cpu', compute_type='int8')" \
 && chmod -R a+rX /opt/models                    # the app user reads the cache; root wrote it
ENV HF_HUB_OFFLINE=1

COPY checker/ checker/
COPY pipeline/ pipeline/
COPY api/ api/
COPY demo/ demo/
COPY data/ data/

RUN useradd --system --uid 10001 --home /app app \
 && mkdir -p /data \
 && chown -R app /data
USER app
VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/api/health', timeout=4)"

# No --reload, one worker (the rate limits are counted in memory), no access log (it would hold every visitor's
# address; the host keeps its own request log), proxy headers read by api/limits.py from PERMIT_PROXY_HOPS only.
CMD ["sh", "-c", "exec uvicorn api.main:app --host 0.0.0.0 --port \"$PORT\" --workers 1 --no-access-log --no-server-header --no-proxy-headers --timeout-graceful-shutdown 20"]
