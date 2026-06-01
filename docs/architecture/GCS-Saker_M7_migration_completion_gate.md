# GCS-Saker M7 Migration Completion Gate

## 완료 기준

M7 언어 전환 완료는 "repo 안에 Python 경로가 하나도 남지 않는 상태"가 아니라, 현재 Dashboard와 단일 노드 runtime smoke가 사용하는 active runtime path가 Python backend 없이 Spring/Kotlin, Go, MediaMTX, coturn으로 검증되는 상태를 뜻한다.

## Active Runtime Path

| 기능 | Edge 경로 | 담당 |
| --- | --- | --- |
| 인증/세션 | `/auth-policy/auth/*` | Spring/Kotlin auth-policy |
| Health/ready | `/healthz`, `/readyz` | Spring/Kotlin auth-policy |
| Stream API | `/media-control/api/v1/streams*`, `/stream/status` | Go media-control |
| WebRTC/HLS signaling | `/webrtc/*`, `/hls/*` | MediaMTX |
| ICE server 목록 | `/media-control/api/v1/streams/ice-servers` | Go media-control |
| Telemetry ingest/read | `/api/telemetry/`, `/api/telemetry/all` | Spring/Kotlin auth-policy read-model |
| Asset read | `/api/asset/*` | Spring/Kotlin auth-policy read-model |

## Legacy/Future Fallback

| 경로 | 현재 위치 | M7 판단 |
| --- | --- | --- |
| `/api/auth/*` | Python backend | v0.2.0 호환 fallback. M7 dashboard build는 사용하지 않는다. |
| `/api/control/*` | Python backend | 실제 장비 제어 정책이 확정되지 않은 future command 기능이다. |
| `/api/v1/ai/mock/detections` | Python backend | 실제 AI overlay server 연동 전 mock contract다. |
| `/metrics` | Python backend | 신규 서비스별 metrics 설계 전까지 legacy observation이다. |
| `/ws/*` | Python backend | WebSocket contract가 확정되지 않은 future/legacy path다. |

## 운영 판단

구현 전 기능은 언어 전환 완료의 blocker로 보지 않는다. 다만 해당 기능을 제품 기능으로 승격하는 순간, DTO/VO, 인증/인가, runtime smoke, 단위/통합 테스트를 포함한 별도 이슈로 Spring/Kotlin 또는 Go 경로에 구현한다.

## 검증 게이트

1. `scripts/m7_single_node_runtime_smoke.sh --run`이 active runtime path를 모두 확인한다.
2. Nginx contract test가 active cutover와 legacy fallback 경로를 구분한다.
3. Compose contract test가 edge가 active cutover 서비스에 의존하도록 보장한다.
4. performance benchmark는 M7 active runtime path 기준으로 수행한다.
