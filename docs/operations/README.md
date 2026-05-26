# GCS-Saker Operations README

작성일: 2026-05-26 KST

## 목적

이 디렉터리는 GCS-Saker의 운영, 배포, 장애 대응, 서버 기준선, 보안 하드닝, 릴리즈 준비에 필요한 문서를 모은다. 세부 서버 인벤토리와 보안 민감 정보는 GitHub에 남기지 않고, 공개 가능한 요약과 절차만 기록한다.

## 문서 목록

| 문서 | 목적 |
| --- | --- |
| `GCS-Saker_M2_이슈마일스톤_일정.md` | M2 이슈 순서와 실제 서버 배포 시작점 정리 |
| `GCS-Saker_운영장애대응_산출물_일정.md` | 장애 대응/복구/성능/운영 산출물 일정 정리 |
| `GCS-Saker_운영장애대응_Runbook_v0.1.md` | M2 배포 전 장애 감지, 완화, 복구, 사용자 표시 기준 초안 |
| `GCS-Saker_Docker_env_주입_가이드_v0.1.md` | Docker Compose env 주입 구조와 local/staging/production 분리 기준 |
| `GCS-Saker_서버기준선_점검표_v0.1.md` | Server-01/Server-02 기준선 점검 항목 |
| `GCS-Saker_서버기준선_점검결과_TEMPLATE.md` | 비공개 점검 결과 작성 템플릿 |
| `GCS-Saker_서버보안하드닝_계획_v0.1.md` | Server-01/Server-02 보안 점검 요약과 하드닝 적용 계획 |

## 공개/비공개 기준

GitHub에 기록 가능한 내용:

- 마일스톤별 큰 계획
- 공개 가능한 OS/Docker 가능 여부 수준의 요약
- `Ready`, `Ready with Risk`, `Blocked` 같은 판정
- 서버에 적용할 보안/방화벽/배포 정책
- 테스트 명령과 통과 기준
- UI 설계 의도와 스크린샷
- 릴리즈 노트와 known issues

GitHub에 그대로 기록하지 않는 내용:

- SSH 접속 정보, 비밀번호, private key
- 내부 IP 원문
- 상세 포트 스캔 원문
- 프로세스 전체 원문
- DB 이름/계정/경로/secret
- 방화벽 정책 중 외부 공격에 직접 악용될 수 있는 세부값
- 악성코드 점검 원시 로그

## M2 운영 흐름

M2에서는 먼저 기준선과 보안/장애 대응 체계를 세우고, 후반부터 실제 서버에 올린다.

1. Server-01/Server-02 기준선 점검
2. 기존 Saker 서버 백업
3. 서버 보안 점검 및 하드닝 계획
4. 운영 장애 대응 Runbook 초안
5. health/readiness 기준
6. env/proxy/port/DNS 정책
7. Auth와 dashboard MVP
8. multi-stream UI와 reconnect/fallback
9. mini failure smoke와 로컬/휴대폰 카메라 WebRTC 테스트
10. Server-02 staging 실제 배포
11. Server-01 production 후보 실제 배포
12. v0.2.0 release 준비

## UI 보고 기준

M2에서 dashboard UI 또는 주요 컴포넌트가 만들어지면 다음을 함께 남긴다.

- 구현 전/후 요약
- desktop screenshot
- mobile 또는 narrow viewport screenshot
- 주요 상태: online, offline, reconnecting, fallback, degraded, error
- 어떤 테스트가 UI 상태를 검증하는지
- coverage에서 아직 빠진 영역

## 영향 작업 원칙

다음 작업은 수행 전 사용자에게 먼저 말하고 진행한다.

- 서버 reboot
- Docker container stop/down/remove
- package install/upgrade
- firewall rule 변경
- SSH 설정 변경
- 기존 Saker 서비스 중지
- DB dump 또는 restore
- Nginx/MediaMTX reload/restart

## 현재 서버 기준선 판정

2026-05-26 KST 기준 Server-01/Server-02 모두 M2-02 백업으로 진입 가능하지만 `Ready with Risk` 상태다. 상세값은 비공개 운영 결과로 보관하고, GitHub에는 sanitized 결과만 기록한다.

주요 후속 항목:

- 일반 user의 Docker 권한 정책 결정
- Server-01 Docker Compose 상태 보강
- Server-02 host nginx와 container nginx 역할 분리
- UFW/fail2ban/auditd/AppArmor/악성코드 점검 계획
- 업데이트와 재시작은 사전 보고 후 서버별 순차 수행
