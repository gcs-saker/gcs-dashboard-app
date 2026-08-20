from prometheus_client import Counter

TELEMETRY_SUBSCRIBER_MESSAGES = Counter(
    "gcs_saker_backend_telemetry_subscriber_messages_total",
    "Telemetry MQTT messages by stable processing result.",
    ("result",),
)


def record_telemetry_message(result: str) -> None:
    TELEMETRY_SUBSCRIBER_MESSAGES.labels(result=result).inc()
