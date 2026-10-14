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

Official deployment and component guidance:

- https://opentelemetry.io/docs/collector/deploy/
- https://opentelemetry.io/docs/platforms/kubernetes/helm/collector/
