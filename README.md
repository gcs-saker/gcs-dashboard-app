# GCS-Saker Architecture POC

GCS-Saker는 저지연 WebRTC 기반 현장 스트리밍, 인증/인가, 장비 telemetry, 운영 이벤트 관측을 함께 다루는 관제 시스템 POC입니다. 저장소에는 소스코드와 재현 가능한 설정 예시만 둡니다. 로컬 산출물, 빌드 결과, IDE 설정, 인증서, 실제 secret은 커밋하지 않습니다.

## Repository Layout

```text
backend/                  Python legacy/fallback API and protocol utilities
gcs-dashboard/            React + TypeScript dashboard
services/auth-policy/     Spring Boot + Kotlin auth, policy, ops read model
services/media-control/   Go media-control, stream registry, ICE, gateway
deploy/                   Compose, Nginx, Mosquitto example configuration
scripts/                  Smoke, gates, benchmarks, reports, ops scripts
contracts/                Shared protocol contract assets
```

## Local Setup

Copy only the example env files you need and replace local values outside git:

```bash
cp backend/.env.example backend/.env
cp gcs-dashboard/.env.example gcs-dashboard/.env
cp deploy/compose/.env.single-node.example deploy/compose/.env.single-node
```

Do not commit copied `.env` files. Keep certificates and real credentials in a server-private path.

## Install And Verify

Frontend:

```bash
cd gcs-dashboard
npm install
npm run typecheck
npm run build
npm test -- --run
```

Python backend:

```bash
cd backend
python3.12 -m pip install -r requirements.txt
python3.12 -m ruff check .
python3.12 -m ruff format --check .
python3.12 -m mypy --config-file pyproject.toml .
PYTHONPATH=. python3.12 -m pytest -q
```

The initial Ruff gate intentionally focuses on syntax, import order, undefined names, and unused imports. Wider lint rules should be added in separate issues so style expansion does not hide behavior changes.

Spring auth-policy:

```bash
cd services/auth-policy
./gradlew test
```

Go media-control:

```bash
cd services/media-control
go test ./...
```

## Runtime Configuration

System-dependent values are separated into example env files:

- `backend/.env.example`
- `gcs-dashboard/.env.example`
- `deploy/compose/.env.single-node.example`
- `deploy/compose/.env.closed-network.example`
- `deploy/compose/.env.public-ice.example`

Use the same key names across local, staging, production, and closed-network profiles. Replace values through environment variables or server-side secret management, not source edits.

## Source Hygiene

The repository should not include:

- `node_modules`, `dist`, `build`, `coverage`, `test-results`
- Python caches such as `__pycache__`, `.pytest_cache`, `.mypy_cache`
- IDE folders such as `.idea`, `.vscode`
- real `.env`, certificate private keys, DB dumps, runtime volumes

If a generated artifact is needed for delivery, create it outside the source branch or publish it as a release artifact.
