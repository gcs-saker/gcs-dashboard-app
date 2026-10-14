# OpenTelemetry Collector internal gateway

The `observability` Compose profile introduces an internal-only OpenTelemetry Collector gateway. It does not replace REST, gRPC, MQTT, WebRTC, logs, or application health checks, and it is not enabled by default during this first adoption step.

The image is the official contrib `0.162.0` distribution pinned by digest. The Collector receives OTLP/gRPC and OTLP/HTTP only on `control-net`; Compose publishes no Collector port to the host. Its health extension and internal metrics endpoint are likewise reachable only by containers on that private network.

The pipeline applies a memory limiter before other processors, removes credential-bearing and high-cardinality attributes, batches with fixed upper bounds, and uses a sampled basic debug exporter. No internet or vendor exporter is configured. Collector failure therefore cannot block login, streaming, talkback, telemetry ingestion, or device control because no application depends on Collector readiness.

Run the isolated validation without starting the application stack:

```bash
docker compose \
  --env-file deploy/compose/.env.single-node.example \
  -f deploy/compose/compose.single-node.poc.yml \
  --profile observability up -d otel-collector
```

Production promotion requires a second step that connects each service through bounded asynchronous exporters, proves fail-open behavior with the Collector stopped, and measures accepted, refused, sent, failed, queue, and drop metrics. External export and disk-backed queues remain disabled until their destination, retention, encryption, and storage ceiling are approved.

The Python backend supports the first bounded OTLP connection behind disabled defaults:

```text
BACKEND_OTEL_TRACES_ENABLED=false
BACKEND_OTEL_TRACES_EXPORTER=none
BACKEND_OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
BACKEND_OTEL_EXPORT_TIMEOUT_SECONDS=1.0
BACKEND_OTEL_BSP_MAX_QUEUE_SIZE=512
BACKEND_OTEL_BSP_MAX_EXPORT_BATCH_SIZE=128
```

Setting the exporter to `otlp` is accepted only for the internal Collector hostname or local test addresses. Span completion enqueues to the SDK batch worker instead of performing network I/O on the request path. The backend has no Compose dependency on Collector health, and shutdown owns a bounded flush before closing the provider.

Media Control follows the same disabled and fail-open boundary with `MEDIA_CONTROL_TRACE_EXPORTER=none`. Its OTLP mode accepts only `otel-collector:4317` or local test addresses, uses a 512-span queue, exports at most 128 spans per batch, disables exporter retries, and limits each export attempt to one second. Media Control startup and readiness do not depend on Collector health.

Official deployment and component guidance:

- https://opentelemetry.io/docs/collector/deploy/
- https://opentelemetry.io/docs/platforms/kubernetes/helm/collector/
