# GCS-Saker 서버기준선 점검표 v0.1

작성일: 2026-05-26 KST

## 목적

M2-01의 목적은 Server-01과 Server-02에 실제 배포를 시작하기 전에 현재 서버 상태를 기준선으로 남기는 것이다. 이 기준선은 M2-02 백업, M2-14 이후 staging/production 배포, M5 장애 복구 리허설의 비교 기준이 된다.

## 점검 대상

| 서버 | 역할 | M2 기준 |
| --- | --- | --- |
| Server-01 | production 후보 | M2 후반 production 후보 배포 대상 |
| Server-02 | staging | M2 후반 staging 배포 및 검증 대상 |

## 수집 명령

서버에 접속한 뒤 repository root에서 실행한다.

```bash
scripts/ops/server_baseline_check.sh --server-name Server-01 --output docs/operations/server-baseline-results/Server-01.md
scripts/ops/server_baseline_check.sh --server-name Server-02 --output docs/operations/server-baseline-results/Server-02.md
```

생성되는 `server-baseline-results` 파일에는 IP, process, disk 정보가 포함될 수 있으므로 민감한 운영 정보가 들어가면 그대로 commit하지 않는다. 공유가 필요하면 private 보안 채널 또는 별도 운영 문서로 관리한다.

## 필수 점검 항목

| 항목 | 확인 내용 | Server-01 | Server-02 |
| --- | --- | --- | --- |
| OS 버전 | 배포판, kernel, architecture | TODO | TODO |
| Docker client | `docker --version` | TODO | TODO |
| Docker compose | `docker compose version` | TODO | TODO |
| Docker daemon | `docker info` 응답 여부 | TODO | TODO |
| Disk | `/`, Docker data 경로 여유 공간 | TODO | TODO |
| Memory | total/free/cache/swap | TODO | TODO |
| CPU | core count, load average | TODO | TODO |
| Static IP | 고정 IP 여부, interface 이름 | TODO | TODO |
| Existing Saker process | 기존 backend/dashboard/MediaMTX/nginx/docker process | TODO | TODO |
| Open blockers | M2-02 백업 전 차단 요소 | TODO | TODO |

## 판정 기준

| 상태 | 의미 |
| --- | --- |
| Ready | M2-02 백업과 M2 후반 배포 준비를 진행할 수 있다. |
| Ready with Risk | 진행은 가능하지만 disk, memory, daemon, IP, 기존 process 중 추적해야 할 위험이 있다. |
| Blocked | 백업 또는 배포 전에 서버 접근, Docker daemon, disk, 네트워크 문제를 먼저 해결해야 한다. |

## M2-01 완료 조건

- Server-01과 Server-02의 OS 버전이 기록되어 있다.
- Docker client/compose/daemon 상태가 기록되어 있다.
- disk, memory, CPU 상태가 기록되어 있다.
- static IP 또는 네트워크 interface 확인 결과가 기록되어 있다.
- 기존 Saker 관련 process가 기록되어 있다.
- M2-02 백업으로 넘어갈 수 있는지 `Ready`, `Ready with Risk`, `Blocked` 중 하나로 판정되어 있다.

## 현재 작업 환경에서의 한계

현재 repository에는 Server-01/Server-02 접속 정보가 없다. 따라서 이 문서와 수집 스크립트는 실제 서버에서 실행해야 최종 값이 채워진다. 접속 정보가 제공되면 동일한 스크립트로 두 서버의 기준선을 수집하고 M2-01 결과를 확정한다.
