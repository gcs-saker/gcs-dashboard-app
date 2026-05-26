# GCS-Saker 서버 보안 하드닝 계획 v0.1

작성일: 2026-05-26 KST

## 목적

이 문서는 M2에서 실제 서버 배포를 진행하기 전에 Server-01과 Server-02의 보안 기준선을 정리하고, 영향을 줄 수 있는 하드닝 작업을 어떤 순서로 수행할지 정의한다. 세부 접속 정보, 내부 IP, 상세 포트 원문, 프로세스 원문, secret은 GitHub에 기록하지 않는다.

## 현재 판정

| 서버 | 판정 | 이유 |
| --- | --- | --- |
| Server-01 | Ready with Risk | 보안 도구 일부는 준비되어 있으나 방화벽이 비활성 상태이고 password SSH가 켜져 있다. |
| Server-02 | Ready with Risk | 방화벽은 활성 상태이나 침입 방어/감사/스캐너가 부족하고 password SSH가 켜져 있다. |

두 서버 모두 M2-02 백업이 완료되어 하드닝을 준비할 수 있다. 다만 패키지 설치, 방화벽 변경, SSH 설정 변경, 재시작은 서비스 영향 가능성이 있으므로 별도 승인 후 서버별로 순차 적용한다.

## 점검 요약

| 항목 | Server-01 | Server-02 | 조치 방향 |
| --- | --- | --- | --- |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS | M2에서는 유지, 운영 안정화 후 24.04 LTS 업그레이드 검토 |
| 보안 업데이트 | 소수 보안 업데이트 대기 | 다수 업데이트 대기 | 백업 확인 후 순차 업데이트 |
| 재시작 필요 | 필요 | 필요 | 업데이트 이후 서버별 순차 재시작 |
| UFW | 설치됨, 비활성 | 설치됨, 활성 | 표준 정책으로 정리 |
| fail2ban | 설치됨, 비활성 | 미설치 | SSH/nginx jail 기준 구성 |
| auditd | 활성 | 미설치 | 운영 감사 로그 기준 구성 |
| AppArmor | 활성 | 활성 | Docker/서비스 프로필 점검 |
| unattended-upgrades | 활성 | 활성 | 보안 업데이트 정책 유지 |
| rkhunter/chkrootkit | 설치됨 | 미설치 | 정기 점검 계획 수립 |
| clamscan | 미설치 | 미설치 | 필요 시 clamav 도입 |
| SSH root login | 비활성 | 비활성 | 유지 |
| SSH password login | 활성 | 활성 | key 기반 전환 후 비활성화 |
| SSH pubkey auth | 활성 | 활성 | 유지 |
| SSH X11 forwarding | 활성 | 활성 | 비활성화 권장 |
| Docker socket | docker group 권한 | docker group 권한 | 운영 user 권한 정책 결정 |

## 하드닝 적용 순서

### 1. 백업 확인

- #26 백업 묶음과 checksum을 다시 확인한다.
- rollback notes가 서버별로 존재하는지 확인한다.
- 기존 Saker container down은 백업 확인 후 별도 승인으로만 진행한다.

### 2. SSH hardening

- 운영자 SSH public key 등록 상태를 확인한다.
- password login 비활성화 전 별도 세션으로 key login을 검증한다.
- root login 비활성 상태는 유지한다.
- X11 forwarding은 운영 서버에서 필요하지 않으면 비활성화한다.
- max auth tries는 더 낮은 값으로 조정한다.
- 변경 후 SSH reload는 사전 보고 후 수행한다.

### 3. 방화벽 정책

- 기본 정책은 incoming deny, outgoing allow, routed deny를 기준으로 둔다.
- 외부 공개는 HTTPS 중심으로 정리한다.
- SSH는 운영자 접근 경로만 허용하는 방향을 우선 검토한다.
- WebRTC/HLS/WHEP/WHIP/TURN 포트는 M2 proxy/DNS 정책 확정 후 최소 노출로 적용한다.
- 관리용 포트와 내부 서비스 포트는 외부 공개를 피한다.

### 4. 침입 방어와 감사

- fail2ban은 SSH와 reverse proxy 로그 기반 jail부터 적용한다.
- auditd는 인증, sudo, SSH 설정, Docker 관련 변경을 중심으로 기록한다.
- 로그 보관 기간과 rotate 정책은 디스크 사용량을 고려해 M2 후반에 확정한다.

### 5. 악성코드/루트킷 점검

- Server-01은 기존 rkhunter/chkrootkit 상태를 기준으로 초기 점검을 수행한다.
- Server-02는 도구 설치 후 초기 점검을 수행한다.
- clamav는 대용량 파일과 stream artifact를 고려해 on-demand scan 중심으로 검토한다.
- 원시 scan log는 공개하지 않고, issue에는 pass/warn/action-needed 수준으로만 기록한다.

### 6. Docker 권한 정책

- 현재 Docker socket은 docker group 기반이다.
- 운영 user를 docker group에 넣으면 편리하지만 root equivalent 권한이 생기므로, M2에서는 sudo 기반 운영을 기본으로 둔다.
- CI/CD 또는 배포 자동화가 필요해지는 시점에 제한된 deploy user와 rootless/container policy를 재검토한다.

### 7. 업데이트와 재시작

- 업데이트는 Server-02 staging 후보부터 적용한다.
- 업데이트 후 서비스 상태를 확인하고, 문제가 없을 때 Server-01에 적용한다.
- 재시작은 한 번에 두 서버에 수행하지 않는다.
- 재시작 전에는 container 상태, 백업 checksum, rollback notes, 접속 세션을 확인한다.

## 공개/비공개 기록 기준

GitHub에 기록 가능한 내용:

- 보안 도구 설치/활성 여부의 요약
- Ready, Ready with Risk, Blocked 판정
- 하드닝 정책과 작업 순서
- 적용 전후 검증 항목
- pass/warn/action-needed 수준의 scan 결과

GitHub에 기록하지 않는 내용:

- SSH 접속 정보와 비밀번호
- 내부 IP와 상세 포트 원문
- 프로세스 전체 원문
- `.env` 값과 DB credential
- 백업 파일의 실제 민감 경로
- 악성코드/루트킷 scan 원시 로그

## 다음 실행 이슈 제안

하드닝 실행은 #105에서 바로 수행하지 않고, 아래처럼 별도 이슈로 나누는 것이 안전하다.

| 제안 이슈 | 목적 | 영향 |
| --- | --- | --- |
| M2-02b. SSH key-only 전환 준비 | key login 확인, password login 비활성 계획 | SSH reload 필요 |
| M2-02c. UFW 정책 정리 및 적용 | staging부터 최소 포트 정책 적용 | 방화벽 변경 |
| M2-02d. fail2ban/auditd 설치 및 기본 jail 구성 | 침입 방어와 감사 로그 활성화 | 패키지 설치 |
| M2-02e. 루트킷/악성코드 초기 점검 | rkhunter/chkrootkit/clamav 기준 수립 | CPU/IO 사용 가능 |
| M2-02f. 서버 업데이트 및 순차 재시작 | 보안 업데이트 반영 | 재시작 필요 |

## 검증 기준

- SSH 변경 후 새 세션 접속 성공
- UFW 적용 후 SSH/HTTPS/dashboard/API/media 경로 확인
- fail2ban jail status 확인
- auditd active 상태 확인
- Docker container 상태 정상
- dashboard/backend/MediaMTX health check 정상
- rollback notes로 이전 상태 복구 절차 확인
