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
| `GET /telemetry/all` | Spring/Kotlin `GET /telemetry/all` | 완료 | read-model controller test, runtime smoke |
| `GET /asset/{uuid}` | Spring/Kotlin `GET /asset/{uuid}` | 완료 | read-model controller test, runtime smoke |

## 아직 남은 Python Legacy

| 기존 경로 | 제안 신규 담당 | 이유 |
| --- | --- | --- |
| `POST /telemetry/` | Spring/Kotlin telemetry ingest API, 장기적으로 time-series/geo 저장소 | 위치, timestamp, AI overlay 정합성의 입력이다. 현재 read-only 조회는 Spring/Kotlin으로 이전됐다. |
| `POST /control/` | Spring/Kotlin command API 또는 별도 command service | 인증/인가가 강해야 하고 MQTT publish는 adapter로 분리해야 한다. |
| `POST /api/v1/ai/mock/detections` | Kotlin API contract 또는 AI adapter service | 실제 AI overlay 전 mock contract 유지가 필요하다. |
| `GET /metrics` | 신규 서비스별 metrics | Python process metric에 묶여 있어 서비스별 metrics로 분리해야 한다. |

## 다음 전환 순서

1. Spring/Kotlin telemetry ingest API: 수신 데이터가 read-model까지 반영되는 경로를 구성한다.
2. Spring/Kotlin command API: auth-policy permission과 command publish adapter 결합.
3. AI mock/overlay contract 이전: 실제 AI server 연동 전 contract 고정.
4. 신규 서비스별 metrics 제공.
5. Python backend legacy profile 격리: 신규 경로가 모두 통과한 뒤 edge에서 Python auth/stream 경로 제거.
