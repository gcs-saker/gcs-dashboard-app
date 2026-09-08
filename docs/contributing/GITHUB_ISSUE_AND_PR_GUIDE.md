# GCS-Saker Issue 및 Pull Request 작성 가이드

이 문서는 작업의 성격에 맞는 GitHub Issue Form을 선택하고, 구현 결과를 하나의 일관된 Pull Request 형식으로 기록하기 위한 기준이다.

## Issue 유형 선택

| 상황 | Issue Form | 기본 라벨 | 핵심 질문 |
| --- | --- | --- | --- |
| 정상 동작이 깨졌거나 회귀가 발생함 | Bug report | `type: bug` | 무엇이 실제로 발생했고 무엇이 기대 동작인가? |
| 새로운 사용자·장비·운영 기능이 필요함 | Feature request | `type: feature` | 누구에게 어떤 결과를 제공해야 하는가? |
| 인증, 인가, credential, 그룹 경계 또는 정보 노출 문제 | Security change | `area: security` | 위협과 신뢰 경계가 무엇이며 어떻게 거부할 것인가? |
| 배포, 서버, 프록시, 백업, 장애 또는 런북 작업 | Operations task | `type: ops` | 어떤 운영 상태를 만들고 어떻게 복구할 것인가? |
| 외부 동작을 유지하며 구조·이름·책임을 개선함 | Refactoring task | `type: refactor` | 보존할 계약과 제거할 구조적 부채는 무엇인가? |
| 자동·수동·장비·부하 검증 자체가 목적임 | Test task | `type: test` | 무엇을 어떤 증거로 PASS/FAIL 판단할 것인가? |

문서만 변경하는 작업은 가장 가까운 유형을 선택한 뒤 `type: docs`를 추가한다. 원인이 불분명한 기술 조사는 Bug 또는 Operations Form을 사용하고 본문에서 `원인: 조사 중`으로 표시한다.

## 제목 규칙

Issue 제목은 다음 형식을 사용한다.

```text
[P0|P1|P2|P3][영역] 문제 또는 목표
```

예시:

```text
[P0][Deploy] 배포 중 공개 API 502 응답 방지
[P1][Security] 내부 upstream 주소 외부 노출 차단
[P2][Streaming] 스트림 선택 화면의 중복 제어 제거
```

Pull Request 제목은 Conventional Commit 형식을 사용한다.

```text
fix: prevent upstream gaps during production deploys
feat: add account-authenticated publisher sessions
refactor: separate stream polling responsibilities
test: add negative authorization contracts
docs: document device telemetry integration
```

## 우선순위 기준

- `P0`: 서비스 중단, 인증 우회, credential 노출, 데이터 손실 또는 운영 빌드 불가
- `P1`: 핵심 기능 장애, 주요 보안·운영 위험 또는 반복되는 자원 고갈
- `P2`: 일반 결함, 제한적 구조 개선, UX·문서·검증 개선
- `P3`: 낮은 영향의 정리나 장기 후보 작업

## 공통 작성 원칙

- Issue는 해결책보다 문제와 완료 조건을 먼저 명확히 한다.
- 확인한 사실과 추정은 구분한다. 미확정 원인은 `조사 중`으로 표시한다.
- UUID, credential, bearer/renewal/publish token, cookie, private route를 본문·로그·스크린샷에 포함하지 않는다.
- 보안 및 routing 변경에는 성공 경로와 거부 경로를 모두 완료 조건에 포함한다.
- 물리 장비가 없어 검증하지 못한 항목은 `BLOCKED`이며 `PASS`로 기록하지 않는다.
- 운영 반영은 Server-01/55121만 대상으로 하며 Server-02/55122를 대체 경로로 사용하지 않는다.

## Issue 완료 조건 작성법

완료 조건은 구현 방법이 아니라 관찰 가능한 결과로 작성한다.

좋은 예:

```text
- 비인가 사용자의 playback session 요청이 403으로 거부된다.
- 공개 응답과 로그에 내부 hostname과 credential이 포함되지 않는다.
- 배포 commit과 모든 application container revision이 일치한다.
```

피해야 할 예:

```text
- 코드를 잘 수정한다.
- 보안을 강화한다.
- 테스트한다.
```

## Pull Request 작성 기준

모든 PR은 `.github/pull_request_template.md`를 사용한다. 작은 UI 수정이라도 요약, 연결 Issue, 검증, 영향 범위는 남긴다. 해당하지 않는 항목은 삭제하지 않고 `해당 없음`과 이유를 작성한다.

운영 배포가 포함되면 다음 증거가 필요하다.

- CI 통과 결과
- 배포 기준 immutable commit SHA
- 공개 health/readiness 결과
- 인가 거부 결과
- 컨테이너 health와 source revision 일치
- 신규 5xx, restart 및 OOM 여부
- rollback 대상 release 또는 commit

## 상태 기록

검증 결과는 다음 네 상태만 사용한다.

- `PASS`: 실행했고 기대 결과를 증거로 확인함
- `FAIL`: 실행했고 기대 결과와 다름
- `BLOCKED`: 장비, 권한 또는 외부 의존성 때문에 실행할 수 없음
- `NOT_RUN`: 아직 실행하지 않음

