# GCS-Saker Release Notes README

작성일: 2026-05-26 KST

## 목적

GCS-Saker는 milestone 종료 시점마다 tag와 release note를 남긴다. 각 release note는 어떤 기능이 가능해졌는지, 어떤 테스트가 통과했는지, 운영상 알려진 제한사항이 무엇인지 추적하기 위한 문서다.

## 버전 기준

| Version | Milestone | 의미 |
| --- | --- | --- |
| `v0.1.0` | M1 | Streaming Core 기반 구축 |
| `v0.2.0` | M2 | 서버 배포 가능한 GCS MVP 후보 |
| `v0.3.0` | M3 | Device, Telemetry, Map foundation |
| `v0.4.0` | M4 | AI Adapter, Group Permission, Control |
| `v1.0.0` | M5 | TURN, stability, final delivery |
| `v0.6.0` | M6 | Mobile/closed-network planning |
| `v0.7.0` | M7 | Spring/Kotlin auth-policy, Go media-control, single-node active runtime path |
| `v0.7.1` | M7 | M7 release cutover evidence gate and server verification patch |
| `v0.7.2` | M10 | API contract와 runtime boundary refactor 기준선 |

Patch version은 같은 milestone 안에서 보안 패치, 장애 수정, 문서 보강, hotfix가 있을 때 사용한다.

## 실제 릴리스 타임라인

| 날짜 | Tag/기준선 | 비고 |
| --- | --- | --- |
| 2026-05-21 | `legacy-saker-before-realtime-2026-05-21` | legacy snapshot |
| 2026-05-29 | `v0.2.0` | stable server baseline |
| 2026-06-04 | `v0.7.0` | M7 completion release |
| 2026-06-26 | `v0.7.1` | M7 release cutover evidence |
| 2026-07-06 | `v0.7.2` | contract/runtime boundary refactor |

`v0.3.0`, `v0.4.0`, `v0.6.0`, `v1.0.0`은 계획된 버전이지만 2026-07-24 현재 tag가 없다. 이 버전들을 소급 생성하지 않는다. M3~M6 완료 여부는 `.github/backlog-status.md`의 이슈별 acceptance evidence로 판단하며, `v1.0.0`은 M5 실서버 부하·복구·납품 증거가 완료된 뒤 생성한다.

예시:

- `v0.2.1`: M2 배포 후보에서 발견된 보안/설정 hotfix
- `v0.2.2`: M2 dashboard UI 또는 reconnect/fallback 버그 수정
- `v0.3.1`: telemetry WSS 장애 수정

## Release Note 형식

각 tag에는 아래 항목을 포함한다.

```markdown
# GCS-Saker vX.Y.Z Release Notes

## 요약

## 포함된 주요 이슈

## 가능해진 것

## 변경된 UI/UX

## Backend/API 변경

## Server/Deployment 변경

## Test 결과

## Security/Audit 결과

## Known Issues

## Rollback 기준

## 다음 Milestone 진입 조건
```

## Tag별 필수 기록

| 항목 | 기록 기준 |
| --- | --- |
| commit hash | release tag가 가리키는 commit |
| Docker image tag | 배포에 사용한 image tag |
| server deployment version | Server-01/Server-02 배포 버전 |
| issue list | closed issue와 deferred issue |
| test result | backend/frontend/unit/integration/build/audit |
| UI evidence | screenshot 또는 설명 |
| known issues | 운영자가 알아야 하는 제한사항 |
| rollback | 되돌릴 image/tag/env/compose 기준 |

## 보안 기록 기준

보안 결과는 공개 가능한 요약만 release note에 남긴다.

공개 가능:

- 취약점 없음 또는 조치 완료 여부
- 보안 도구 설치/활성화 여부의 요약
- hardening 적용 여부
- known risk의 고수준 설명

비공개 유지:

- 내부 IP
- 상세 포트 원문
- 프로세스 원문
- 악성코드 스캔 원시 로그
- 계정/secret/path

## v0.1.0 초안 위치

M1 release candidate 문서는 아래에 있다.

- `docs/m1/streaming-core-v0.1.0-release-candidate.md`

## v0.2.0 작성 시점

`v0.2.0` release note는 M2-17에서 작성한다. 포함해야 할 핵심은 다음과 같다.

- Server-02 staging 검증 결과
- Server-01 production 후보 검증 결과
- mini failure smoke 결과
- 로컬/휴대폰 카메라 WebRTC 테스트 결과
- dashboard MVP screenshot
- backend/frontend test coverage
- security/audit sanitized summary
- known issues와 M3 진입 조건

## v0.7.0 작성 시점

M7 release note는 아래 문서에 둔다.

- `docs/releases/GCS-Saker_v0.7.0_M7_release_notes.md`

M7의 완료 기준은 Python backend 삭제가 아니라 active runtime path가 Spring/Kotlin auth-policy, Go media-control, MediaMTX, coturn, Redis, React/TypeScript dashboard로 통과하는지이다.

M7 release cutover patch note는 아래 문서에 둔다.

- `docs/releases/GCS-Saker_v0.7.1_M7_release_cutover_notes.md`
