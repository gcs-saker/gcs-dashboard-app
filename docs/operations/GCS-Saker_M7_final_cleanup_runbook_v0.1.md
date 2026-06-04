# GCS-Saker M7 Final Cleanup Runbook v0.1

## 목적

이 문서는 #275 M7 final cleanup 기준을 고정한다. 목표는 M7 active runtime path를 유지하면서 repository 보안 위생, legacy/deprecated 경로의 남은 이유, 서버 checkout 소유권, 운영 smoke 결과를 한 번에 확인할 수 있게 만드는 것이다.

## 정리된 항목

### 1. 로컬 env 파일 추적 제거

`gcs-dashboard/.env`는 로컬 실행 설정이므로 Git에 추적되면 안 된다. 실제 운영 값, 토큰, 내부 endpoint가 들어갈 수 있기 때문이다.

- 처리: `git rm --cached gcs-dashboard/.env`
- 보존: 개발자 로컬 파일 자체는 삭제하지 않는다.
- 기준: repository에는 `.env.example`, `.env.production.example`, `.env.staging.example`, `.env.closed-network.example` 같은 예제 파일만 남긴다.
- 회귀 방지: `backend/tests/test_m7_final_cleanup_contract.py`가 민감 env 파일 추적 여부를 `git ls-files` 기준으로 검사한다.

### 2. scratch 파일 삭제

다음 파일은 실행 가능한 산출물이나 문서가 아니라, 개발 중 생긴 임시 파일이다.

- `backend/의존성 충돌해결`
- `gcs-dashboard/gcs-dashboard@0.1.0`
- `gcs-dashboard/npm`
- `gcs-dashboard/react-scripts`

의존성 복구 절차는 임시 파일이 아니라 공식 명령으로 관리한다.

```bash
cd gcs-dashboard
npm ci
npm audit --audit-level=low

cd ../services/auth-policy
./gradlew check
```

### 3. 의존성 취약점 점검

현재 frontend 기준 `npm audit --audit-level=low --json` 결과는 `0 total`이다. GitHub dependency graph가 push 시점에 다른 기준으로 경고를 낼 수 있으므로, final PR에서는 다음을 모두 확인한다.

- frontend: `npm audit --audit-level=low`
- frontend: `npm run test:coverage`
- frontend: `npm run build`
- Kotlin/Spring: `./gradlew check`
- Python: `PYTHONPATH=backend python3.12 -m pytest backend/tests --cov=backend --cov-report=term-missing`
- Go: `go test ./... -cover`

Python backend는 `backend/pyproject.toml`에서 `>=3.12,<3.13`로 고정한다. 기본 shell의 `pytest`가 Python 3.14에 연결되면 SQLAlchemy typing compatibility 오류가 날 수 있으므로, M7 검증은 반드시 Python 3.12 runner로 실행한다.

GitHub 경고가 남으면 dependency graph가 어느 manifest를 보는지 확인하고 별도 security issue로 승격한다.

### 4. Server-02 dubious ownership

Server-02 staging checkout은 root-owned 경로가 섞여 있어 sudo가 필요할 수 있다. 이는 기능 장애는 아니지만 운영 절차를 흐리게 만든다.

M7 final cleanup에서 `/home/user/gcs-saker-runtime/releases/m7-20260602-7a1e156-server02`와 `.git` 소유권을 `user:user`로 정리했다. 이후 `git status --short --branch`가 sudo 없이 정상 동작한다.

권장 처리 순서:

1. release 경로와 owner를 확인한다.
2. running compose project와 volume path를 확인한다.
3. Git checkout owner를 배포 사용자로 통일한다.
4. `git status --short --branch`가 sudo 없이 동작하는지 확인한다.
5. `docker compose ps`는 필요한 경우에만 sudo로 실행한다.

이 작업은 서버 파일 소유권 변경을 포함하므로, 실행 전 서버별 백업 경로와 running container 상태를 먼저 기록한다.

### 5. legacy/deprecated 경로 관리

M7은 Python backend를 즉시 삭제하는 milestone이 아니다. Active runtime path가 Spring/Kotlin auth-policy, Go media-control, MediaMTX, coturn으로 통과하는 것이 완료 기준이다.

남기는 경로:

- `/stream/status`: Go media-control compatibility endpoint. `Deprecation: true`와 replacement route를 내려준다.
- `/api/control/*`: 실제 장비 제어 정책 확정 전 future command fallback.
- `/api/v1/ai/mock/detections`: 실제 AI overlay server 전 mock contract.
- `/metrics`, `/ws/*`: 신규 관측/웹소켓 계약 확정 전 legacy/future path.

삭제 조건:

1. 대체 서비스가 DTO/VO와 권한 정책을 가진다.
2. route contract test가 추가된다.
3. runtime smoke가 대체 경로를 검증한다.
4. rollback 문서가 있다.

### 6. 운영 smoke와 degraded behavior

M7 final cleanup 후 운영 smoke는 다음 순서로 수행한다.

1. `docker compose config --quiet`
2. dashboard build
3. edge restart
4. 내부 HTTPS smoke: `/`, `/healthz`, `/readyz`, `/stream/status`
5. 외부 HTTPS smoke: `https://a4ai.tplinkdns.com/`
6. 장애 모드 점검: Redis, TURN, MediaMTX 중단 시 degraded behavior

degraded behavior의 기준은 "완전 성공"이 아니라 "사용자가 무엇이 끊겼는지 볼 수 있고, 인증/세션/stream 선택 UI가 잘못된 정상 상태로 보이지 않는 것"이다.
