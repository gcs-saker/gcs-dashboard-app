# GCS-Saker M7 Language Migration Parity Matrix

## 목적

Python legacy backend에서 제공하던 기능이 Spring/Kotlin 또는 Go 경로로 빠짐없이 이전되는지 추적한다. 기준은 "기존에 되던 기능이 새 언어 경로에서도 동일하게 동작해야 한다"이다.

## 전환 완료

| 기존 Python 경로 | 신규 경로 | 상태 | 검증 |
| --- | --- | --- | --- |
| `POST /auth/login` | Spring/Kotlin `POST /auth-policy/auth/login` | 완료 | auth-policy smoke |
| `POST /auth/signup` | Spring/Kotlin `POST /auth-policy/auth/signup` | 완료 | signup smoke, controller test |
| `POST /auth/refresh` | Spring/Kotlin `POST /auth-policy/auth/refresh` | 완료 | auth-policy smoke |
| `POST /auth/logout` | Spring/Kotlin `POST /auth-policy/auth/logout` | 완료 | auth-policy smoke |
| `GET /auth/me` | Spring/Kotlin `GET /auth-policy/auth/me` | 완료 | auth-policy smoke |
| `GET /api/v1/streams*` | Go `GET /media-control/api/v1/streams*` | 완료 | media-control smoke |
| `GET /api/v1/streams/ice-servers` | Go `GET /media-control/api/v1/streams/ice-servers` | 완료 | runtime smoke |
| `GET /healthz`, `GET /readyz` | Spring/Kotlin `GET /healthz`, `GET /readyz` | 완료 | runtime smoke |
| `GET /stream/status` | Go `GET /stream/status` | 완료 | runtime smoke |
| `POST /telemetry/` | Spring/Kotlin `POST /telemetry/` | 완료 | ingest-read controller test, runtime smoke |
| `GET /telemetry/all` | Spring/Kotlin `GET /telemetry/all` | 완료 | read-model controller test, runtime smoke |
| `GET /asset/{uuid}` | Spring/Kotlin `GET /asset/{uuid}` | 완료 | read-model controller test, runtime smoke |

## 아직 남은 Python Legacy

| 기존 경로 | 제안 신규 담당 | 이유 |
| --- | --- | --- |
| `POST /control/` | Spring/Kotlin command API 또는 별도 command service | 인증/인가가 강해야 하고 MQTT publish는 adapter로 분리해야 한다. |
| `POST /api/v1/ai/mock/detections` | Kotlin API contract 또는 AI adapter service | 실제 AI overlay 전 mock contract 유지가 필요하다. |
| `GET /metrics` | 신규 서비스별 metrics | Python process metric에 묶여 있어 서비스별 metrics로 분리해야 한다. |

## 다음 전환 순서

1. Python backend legacy profile 격리: 신규 경로가 모두 통과한 뒤 edge에서 Python auth/stream/read 경로 제거.
2. Spring/Kotlin command API: 실제 제어 UX와 장비 인증 정책이 확정되면 auth-policy permission과 command publish adapter를 결합한다.
3. AI mock/overlay contract 이전: 실제 AI server 연동 전 contract 고정.
4. 신규 서비스별 metrics 제공.

## 구현 전 기능의 처리 기준

아직 제품 기능으로 확정되지 않은 control, AI mock, metrics는 M7 언어 전환 완료의 blocker로 보지 않는다. 이 항목들은 실제 사용자 흐름, 장비 인증, 운영 지표 요구사항이 확정되는 시점에 별도 기능 이슈로 구현한다.

완료 게이트의 상세 기준은 [GCS-Saker_M7_migration_completion_gate.md](GCS-Saker_M7_migration_completion_gate.md)에 둔다.
