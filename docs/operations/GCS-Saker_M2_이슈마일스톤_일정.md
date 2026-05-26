# GCS-Saker M2 이슈 마일스톤 일정

작성일: 2026-05-26 KST

## M2 운영 원칙

M2의 핵심 방향은 실제 서버 배포를 바로 시작하지 않고, 초반에는 운영 기준선과 장애 대응 기준을 먼저 만든 뒤 후반부터 Server-02 staging과 Server-01 production 후보에 실제로 올리는 것이다.

즉, M2는 아래 순서로 진행한다.

1. 서버 기준선과 기존 자산 백업
2. 장애 대응 Runbook과 health/readiness 기준
3. env, proxy, port, DNS 같은 배포 전 정책 정리
4. Auth와 Dashboard MVP, multi-stream UI 구현
5. reconnect/backoff/fallback, mini failure smoke, 로컬 웹캠 WebRTC 테스트 검증
6. M2 후반부터 실제 서버 배포
7. v0.2.0 release 준비

## M2 이슈 순서

| 순서 | Issue | 제목 | 단계 | 핵심 산출물 |
| --- | --- | --- | --- | --- |
| M2-01 | #25 | Server-01/Server-02 현재 상태 점검 | 기준선 | 서버 기준선 점검표 |
| M2-02 | #26 | 기존 Saker 서버 백업 | 기준선 | 백업 목록, rollback 명령 초안 |
| M2-03 | #99 | 운영 장애 대응 Runbook 초안 작성 | 장애 대응 설계 | 운영 장애 대응 Runbook 초안 |
| M2-04 | #100 | Backend/MediaMTX health readiness 기준 정리 | 장애 감지 기준 | health/readiness 기준서 |
| M2-05 | #31 | Docker env 주입 구조 정리 | 배포 전 준비 | env/secret 분리표 |
| M2-06 | #28 | Nginx HTTPS/WSS reverse proxy 설계 및 로컬 검증 | 배포 전 준비 | Nginx reverse proxy 설정 초안 |
| M2-07 | #29 | TP-Link 포트포워딩 정책 정리 | 배포 전 준비 | 포트포워딩 정책서 |
| M2-08 | #30 | Cloudflare DNS/DDNS 정책 정리 | 배포 전 준비 | DNS/DDNS 정책서 |
| M2-09 | #32 | Auth 기본 구조 구현 | 기능 기반 | Auth API/토큰 전략 초안 |
| M2-10 | #33 | Dashboard MVP layout 구현 | UI 기반 | 관제 dashboard MVP |
| M2-11 | #34 | Multi-stream grid 기본 구현 | Streaming UI | 다중 stream grid |
| M2-12 | #101 | Streaming reconnect/backoff/fallback 정책 구현 | 장애 완화 | 재연결/fallback 상태 모델 |
| M2-13 | #102 | Mini failure smoke test 작성 | 배포 전 검증 | mini failure smoke script/checklist |
| M2-14 | #103 | 로컬 모니터 캠 WebRTC 테스트 페이지 구성 | 배포 전 검증 | webcam WebRTC test harness |
| M2-15 | #27 | Server-02 staging 실제 배포 구성 | 실제 서버 배포 | staging 배포 검증 보고서 |
| M2-16 | #35 | Server-01 production 후보 실제 배포 | 실제 서버 배포 | production 후보 배포 검증 보고서 |
| M2-17 | #36 | v0.2.0 release 준비 | 릴리즈 | v0.2.0 release note |

## 실제 서버 배포 시작점

실제 서버에 서비스를 띄우는 작업은 `M2-15`부터 시작한다.

- `M2-01`~`M2-14`: 설계, 정책, 로컬 검증, UI/기능 구현, failure smoke, 로컬 웹캠 WebRTC 테스트
- `M2-15`: Server-02 staging 실제 배포
- `M2-16`: Server-01 production 후보 실제 배포
- `M2-17`: v0.2.0 release 준비

이렇게 배치한 이유는 서버에 올린 뒤 장애 대응 기준을 뒤늦게 만드는 흐름을 피하기 위해서다. 먼저 health/readiness, rollback, fallback, failure smoke, 로컬 웹캠 WebRTC 테스트 기준을 만들고 서버에 올려야 문제가 생겼을 때 원인과 대응 순서가 흔들리지 않는다.

## M2 단계별 완료 기준

### 1단계: 기준선과 백업

대상 이슈: #25, #26

완료 기준:

- Server-01/Server-02의 OS, Docker, disk, memory, CPU, static IP 상태가 기록된다.
- 기존 Saker compose, env, nginx, DB, MediaMTX 설정이 백업된다.
- rollback 명령 초안이 기록된다.

### 2단계: 운영 장애 대응 설계

대상 이슈: #99, #100

완료 기준:

- 장애 유형별 감지/완화/복구/사용자 표시가 정리된다.
- backend와 MediaMTX의 liveness/readiness 기준이 정해진다.
- health endpoint와 metrics endpoint의 역할이 분리된다.
- M2 후반 배포 전에 운영자가 확인할 명령과 체크리스트가 존재한다.

### 3단계: 배포 전 인프라 정책

대상 이슈: #31, #28, #29, #30

완료 기준:

- local/staging/production env가 분리된다.
- HTTPS/WSS/API/dashboard/media endpoint 경로가 정리된다.
- 외부 노출 포트와 내부 관리 포트가 분리된다.
- Cloudflare proxy ON/DNS-only 기준이 정리된다.

### 4단계: MVP 기능과 상태 UI

대상 이슈: #32, #33, #34

완료 기준:

- Auth 기본 구조가 테스트된다.
- 첫 화면이 실제 관제 dashboard MVP로 구성된다.
- 4개 이상 stream grid와 selected main stream 개념이 구현된다.
- online/offline/error/fallback 상태가 UI에서 표시될 수 있다.

### 5단계: 장애 완화와 배포 전 smoke

대상 이슈: #101, #102, #103

완료 기준:

- WebRTC 실패 시 HLS fallback 또는 명확한 error 상태로 전환된다.
- reconnect/backoff 정책이 과도한 재시도를 만들지 않는다.
- 최소 3개 이상의 failure smoke 시나리오가 문서화된다.
- backend/API/MediaMTX/AI mock 장애가 dashboard 전체 장애로 확산되지 않는지 확인한다.
- 개발자 PC의 웹캠 또는 모니터 캠으로 임시 WebRTC test stream을 만들 수 있다.
- `raw/local/webcam` 같은 테스트 stream path가 playback API와 dashboard에서 검증된다.

### 6단계: 실제 서버 배포

대상 이슈: #27, #35

완료 기준:

- Server-02 staging에서 dashboard/backend/MediaMTX가 실행된다.
- Server-01 production 후보에서 HTTPS와 WebRTC/HLS 경로가 확인된다.
- sample stream 또는 webcam smoke stream 경로가 확인된다.
- rollback 가능한 image/env/compose 상태가 기록된다.
- 배포 후 known issue와 제한사항이 정리된다.

### 7단계: v0.2.0 릴리즈

대상 이슈: #36

완료 기준:

- M2 필수 이슈가 closed 상태다.
- staging/production 후보 검증 결과가 정리된다.
- mini failure smoke 결과가 정리된다.
- 로컬 웹캠 WebRTC 테스트 결과와 제한사항이 정리된다.
- v0.2.0 release note 초안이 존재한다.
- M3 진입 조건이 정리된다.

## M3로 넘기는 항목

M2에서는 운영/배포의 골격과 streaming/dashboard 장애 완화 기준을 만든다. telemetry 기반 장애 감지와 device/map 연동은 M3에서 본격화한다.

- Device Registry DB/API
- Telemetry ingest API
- Telemetry WSS 연결 끊김 감지
- Redis latest telemetry cache
- telemetry timeout, link quality low, battery low alert
- map panel과 alert 표시

## M5로 남기는 항목

M2는 실제 배포 후보까지 만들지만, 장시간/대규모 안정성 검증은 M5에 남긴다.

- TURN coturn 운영 검증
- 5대 stream 30분 부하 테스트
- 16대 stream 30분 부하 테스트
- GCS 지연 평균 2초 이내 측정
- WebRTC direct vs TURN 사용률 분석
- Server-01 장애 복구 리허설
- AI endpoint 장애 테스트
- Backup/rollback runbook 리허설
