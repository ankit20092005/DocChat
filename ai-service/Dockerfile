FROM python:3.11-slim-bookworm AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    HF_HOME=/opt/docchat-models HF_HUB_DISABLE_TELEMETRY=1 \
    PATH="/opt/venv/bin:$PATH"
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 docchat \
    && useradd --uid 10001 --gid docchat --create-home docchat \
    && install -d -o docchat -g docchat /opt/docchat-models
WORKDIR /srv/docchat

FROM base AS build
RUN python -m venv /opt/venv
COPY requirements.txt .
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==2.15.0 \
    && pip install -r requirements.txt && pip check
COPY app/__init__.py app/config.py app/models.py ./app/
USER docchat
# Instantiate the same two models as the FastAPI lifespan, including their tokenizers.
RUN python -c "from app.models import Models; Models()"

FROM base
ENV PORT=8000 HF_HUB_OFFLINE=1
COPY --from=build /opt/venv /opt/venv
COPY --from=build --chown=docchat:docchat /opt/docchat-models /opt/docchat-models
COPY app ./app
USER docchat
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s CMD ["python","-c","import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.environ['PORT']+'/health',timeout=3).close()"]
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port \"$PORT\" --workers 1"]
