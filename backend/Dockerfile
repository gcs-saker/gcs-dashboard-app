FROM python:3.12.11-slim-bookworm@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7 AS wheels
WORKDIR /build
COPY requirements-runtime.txt .
RUN python -m pip install --no-cache-dir --upgrade pip wheel \
    && pip wheel --no-cache-dir --wheel-dir /wheels -r requirements-runtime.txt

FROM python:3.12.11-slim-bookworm@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7
ARG SOURCE_COMMIT=unknown
LABEL org.opencontainers.image.revision=$SOURCE_COMMIT
ENV TZ=UTC PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN groupadd --system --gid 10001 gcs \
    && useradd --system --uid 10001 --gid gcs --home-dir /app --shell /usr/sbin/nologin gcs
WORKDIR /app
COPY --from=wheels /wheels /wheels
COPY requirements-runtime.txt .
RUN pip install --no-cache-dir --no-index --find-links=/wheels -r requirements-runtime.txt \
    && rm -rf /wheels
COPY --chown=gcs:gcs . .
USER 10001:10001
EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/healthz', timeout=2).read()"
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
