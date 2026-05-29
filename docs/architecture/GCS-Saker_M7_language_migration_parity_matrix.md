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

## 아직 남은 Python Legacy

| 기존 경로 | 제안 신규 담당 | 이유 |
| --- | --- | --- |
| `GET /healthz`, `GET /readyz` | Spring/Kotlin system API + Go media health aggregation | 운영 readiness의 기준 API라 신규 control-plane에서 제공해야 한다. |
| `POST /telemetry/`, `GET /telemetry/all` | Spring/Kotlin telemetry API, 장기적으로 time-series/geo 저장소 | 위치, timestamp, AI overlay 정합성의 입력이다. |
| `GET /asset/{uuid}` | Spring/Kotlin asset API | 자산 트리와 stream publisher group 매핑의 기준 데이터다. |
| `POST /control/` | Spring/Kotlin command API 또는 별도 command service | 인증/인가가 강해야 하고 MQTT publish는 adapter로 분리해야 한다. |
| `POST /api/v1/ai/mock/detections` | Kotlin API contract 또는 AI adapter service | 실제 AI overlay 전 mock contract 유지가 필요하다. |
| `GET /stream/status` | Go media-control 또는 Spring readiness facade | legacy smoke와 운영 readiness가 아직 참조한다. |
| `GET /metrics` | 신규 서비스별 metrics | Python process metric에 묶여 있어 서비스별 metrics로 분리해야 한다. |

## 다음 전환 순서

1. Spring/Kotlin system API parity: `healthz`, `readyz`, `stream/status` facade.
2. Spring/Kotlin telemetry/asset read model: Dashboard 자산 트리와 지도 위치 데이터 기준화.
3. Spring/Kotlin command API: auth-policy permission과 command publish adapter 결합.
4. AI mock/overlay contract 이전: 실제 AI server 연동 전 contract 고정.
5. Python backend legacy profile 격리: 신규 경로가 모두 통과한 뒤 edge에서 Python auth/stream 경로 제거.
