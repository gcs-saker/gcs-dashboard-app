# GCS-Saker Server-02 staging 배포 결과 v0.2

작성일: 2026-05-27 KST

## 목적

M2-15 Server-02 staging 배포에서 실제 서버에 Docker Compose 기반 GCS-Saker stack을 올리고, backend, dashboard, MediaMTX, MQTT, MySQL의 기본 실행 상태를 검증한다.

## 배포 대상

- 대상: Server-02 staging
- OS: Ubuntu 22.04.5 LTS
- 배포 브랜치: `feature/issue-27-server02-staging-deploy`
- Docker image tag:
  - `gcs-saker-backend:m2-staging`
  - `gcs-saker-dashboard:m2-staging`

## 실행한 주요 명령

```bash
cd ~/gcs-saker-m2-staging/gcs-dashboard
sudo docker compose config --quiet
sudo docker compose build
sudo docker compose up -d
sudo docker compose ps
curl -fsS http://127.0.0.1:8001/healthz
curl -fsS http://127.0.0.1:8001/readyz
curl -fsSI http://127.0.0.1:3000/
```

스키마와 staging operator seed는 backend container 내부에서 수행했다. 비밀번호와 token은 로그, PR, 문서에 기록하지 않는다.

## 검증 결과

| 항목 | 결과 |
| --- | --- |
| Docker Compose config | 통과 |
| backend container | `healthy` |
| MySQL container | `healthy` |
| dashboard container | running |
| MediaMTX container | running |
| MQTT container | running |
| `/healthz` | 200 OK |
| `/readyz` | 200 OK |
| dashboard local HTTP | 200 OK |
| `/auth/login` | 200 OK |
| `/api/v1/streams` | 200 OK, 4개 stream 반환 |

확인된 stream id:

- `raw.sample.front`
- `raw.sample.thermal`
- `raw.sample.rear`
- `raw.local.webcam`

## 발견한 문제와 수정

### MySQL foreign key 타입 불일치

증상:

- `Base.metadata.create_all(bind=engine)` 실행 시 MySQL에서 FK 생성이 실패했다.
- 오류는 `users.company_id`가 참조하는 `company.id`와 타입이 맞지 않아 발생했다.

원인:

- `backend/sql/company_sql.py`의 `Company.id`는 `BigInteger`이다.
- `backend/sql/user_sql.py`의 `User.company_id`는 `Integer`여서 MySQL이 FK 호환 불가로 판단했다.
- SQLite 기반 테스트에서는 이 차이가 엄격하게 드러나지 않았기 때문에 실제 MySQL container 검증에서 발견됐다.

수정:

- `backend/sql/user_sql.py`에서 `company_id`를 `BigInteger`로 변경했다.
- `backend/tests/test_mysql_schema_contract.py`를 추가해 `Company.id`와 `User.company_id`의 SQLAlchemy 타입이 모두 `BigInteger`인지 확인한다.

### sudo 환경 변수 전달 누락

증상:

- staging operator seed 중 container 내부 Python에서 `KeyError: 'STAGING_OPERATOR_PASSWORD'`가 발생했다.

원인:

- host shell 변수는 `sudo docker compose exec`로 자동 전달되지 않는다.

수정:

- `sudo env STAGING_OPERATOR_PASSWORD="$STAGING_OPERATOR_PASSWORD" docker compose exec ...` 형태로 명시적으로 전달했다.

## 외부 인입 상태

서버 내부와 host UFW 상태는 정상이다.

- UFW: active
- `3000/tcp`: allow
- Docker publish: `0.0.0.0:3000->3000/tcp`

다만 외부 네트워크에서 `http://a4ai.tplinkdns.com:3000/`, `http://a4ai.tplinkdns.com:8001/`, `http://a4ai.tplinkdns.com/` 접속은 실패했다. 서버 내부 서비스가 정상이고 UFW도 `3000/tcp`를 허용하므로, 남은 원인은 TP-Link/NAT 포트포워딩 또는 상위 네트워크 인입 정책으로 분리된다.

M2-15의 "외부 접속 경로"와 "HTTPS/WSS reverse proxy" 조건은 이 인입 설정이 정리된 뒤 최종 완료로 판단한다.

## 롤백 기준

배포 전 기존 Docker 상태는 Server-02의 private backup 디렉터리에 보관했다.

롤백 절차:

```bash
cd ~/gcs-saker-m2-staging/gcs-dashboard
sudo docker compose down
git switch <previous-known-good-branch>
sudo docker compose up -d
sudo docker compose ps
curl -fsS http://127.0.0.1:8001/healthz
```

MySQL staging volume을 보존해야 하는 상황에서는 `down -v`를 사용하지 않는다. 스키마 검증 실패로 생성된 초기 staging volume을 폐기할 때만 `down -v`를 사용한다.

## 남은 작업

- TP-Link/NAT에서 Server-02 dashboard 또는 reverse proxy public entrypoint를 연결한다.
- `443/tcp` 기반 Nginx HTTPS/WSS reverse proxy를 실제 인증서와 함께 적용한다.
- 외부 브라우저에서 dashboard 접속과 WebRTC/HLS playback path를 확인한다.
- public ingress가 완료되면 #27의 남은 통과 기준을 닫는다.
