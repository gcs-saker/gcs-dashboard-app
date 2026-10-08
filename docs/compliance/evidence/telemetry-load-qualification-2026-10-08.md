# Telemetry ingress virtual-load qualification

- 생성 시각(UTC): `2026-10-08T02:27:34.947743275Z`
- 소스 리비전: `93db68cabc8edb1b6df0113a450fd222486de41d`
- 런타임: `go1.26.6` / `linux/amd64`
- 범위: in-process MQTT ingress partition pipeline; excludes broker, network, gRPC and database latency
- 판정: **PASS (가상 인프로세스 부하)**
- 실제 장비·브로커·네트워크·gRPC·DB 종단 성능 판정: **NOT_RUN**

| 장비 | 송신/처리 | p50 ms | p95 ms | p99 ms | msg/s | 최대 큐 | 실패/압력/손실/순서오류 |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 100/100 | 0.046 | 0.118 | 0.146 | 97.7 | 1 | 0/0/0/0 |
| 50 | 500/500 | 0.040 | 0.078 | 0.123 | 454.2 | 1 | 0/0/0/0 |
| 100 | 1000/1000 | 0.039 | 0.070 | 0.099 | 892.5 | 1 | 0/0/0/0 |

기준: 실패·backpressure·손실·세션 순서 오류 0건, p95 ≤ 200 ms, p99 ≤ 400 ms.
