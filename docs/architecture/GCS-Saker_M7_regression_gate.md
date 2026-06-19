# GCS-Saker M7 Regression Gate

## 목적

#203은 M7 아키텍처 이전 중에도 기존 `v0.2.0` 호환 경로와 새 PoC 경로가 동시에 깨지지 않도록 회귀 검증 순서를 고정한다. 목표는 단순히 빌드만 통과하는 것이 아니라, 실패했을 때 Python legacy, dashboard, Spring/Kotlin auth-policy, Go media-control, runtime smoke 중 어디서 끊겼는지 바로 알 수 있게 하는 것이다.

## 실행 명령

빠른 PR 계약 검증:

```bash
scripts/m7_regression_gate.sh --check
```

릴리즈 또는 고위험 변경 검증:

```bash
PYTHON_BIN=python3.12 scripts/m7_regression_gate.sh --full
```

## v0.2.0 호환 게이트

기존 운영 호환성은 Python backend와 기존 dashboard build/test로 확인한다.

1. backend pytest + coverage
2. backend mypy
3. frontend typecheck
4. frontend test coverage
5. frontend build

Python backend는 `backend/pyproject.toml` 기준 `>=3.12,<3.13`으로 고정한다. repo root가 아니라 `backend/` 디렉터리 기준으로 pytest를 실행해야 `core` import path가 맞는다.

## M7 PoC 게이트

새 구조는 아래 순서로 확인한다.

1. `scripts/architecture_intent_gate.py --json`
2. `docker compose --profile geo ... config --quiet`
3. Spring/Kotlin auth-policy `./gradlew check`
4. Go media-control `go test ./... -cover`
5. `scripts/m7_single_node_runtime_smoke.sh --check`
6. `scripts/m7_publish_play_smoke.sh --check`
7. `scripts/m7_dashboard_first_frame_smoke.sh --check`

Docker live 검증이 가능한 환경에서는 `--check` 이후 각 smoke의 `--run`을 실행한다. 실제 영상 first frame 측정은 #210, #212, #214의 상세 smoke가 담당한다.

## smoke: login -> dashboard -> stream list -> playback contract

M7의 최소 사용자 경로는 아래 contract를 유지해야 한다.

1. login은 Spring/Kotlin auth-policy 또는 v0.2.0 fallback 중 명시된 경로로 성공해야 한다.
2. dashboard는 인증된 세션에서 접근 가능해야 한다.
3. stream list는 Go media-control 또는 Python fallback 중 지정된 경로로 반환되어야 한다.
4. playback contract는 HLS/WHEP URL과 ICE server 목록을 포함해야 한다.
5. player first-frame은 browser smoke에서 `data-has-video-frame=true` 또는 playing 상태로 검증한다.

## 실패 위치 구분

| 실패 지점 | 의심 영역 | 다음 확인 |
| --- | --- | --- |
| backend pytest | v0.2.0 API/DB/DTO 회귀 | failing test와 `backend/tests` fixture 확인 |
| backend mypy | Python type contract | DTO/model type hint 확인 |
| frontend coverage/build | dashboard UI/API contract | `src/features/*` test와 route constants 확인 |
| Gradle check | auth-policy/JWT/group policy | JUnit/Jacoco report 확인 |
| Go coverage | media-control/ICE/MediaMTX adapter | package별 coverage와 mock failure 확인 |
| architecture intent gate | 설계 의도와 코드/compose/proxy 일치 | `GCS-Saker_design_intent_matrix.yml`의 route/protocol/security/runtime intent 확인 |
| compose config | env/profile/depends_on | `deploy/compose` 기본 active runtime과 선택 profile 확인 |
| runtime smoke | edge/auth/media/TURN 연결 | container health와 edge route 확인 |
| publish/play smoke | MediaMTX stream path | publisher, HLS manifest, WHEP signaling 확인 |
| first-frame smoke | browser/player/codec/autoplay | browser console, WebRTC stats 확인 |

## PR 보고 기준

PR에는 어떤 조건을 만족시키기 위해 무엇을 바꿨는지 적고, 실패 원인과 수정 방식은 한국어로 남긴다. 실제 테스트 수치와 상세 실행 결과는 작업 보고에 기록하고, PR에는 과도한 로그를 붙이지 않는다.
