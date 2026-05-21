# GCS Saker Milestones

프로젝트 1번의 마일스톤 정의입니다.

---

## M0. Legacy Freeze & GitHub Setup

**목표:**
기존 Saker 상태를 보존하고, GitHub 작업 관리/브랜치 전략/ruleset을 적용한다.

**마일스톤 목표:**
- legacy branch/tag 생성
- main 보호 ruleset 적용
- GitHub Project 생성
- labels/milestones/issues 생성
- 첫 feature branch 작업 준비 완료

**M1 진입 조건:**
- [ ] legacy branch 및 tag 생성 완료
- [ ] main branch 보호 규칙 적용 완료
- [ ] GitHub Project 1 생성 완료
- [ ] labels, milestones, issues 생성 완료
- [ ] feature branch 작업 환경 검증 완료

---

## M1. Streaming Core 전환

**목표:**
기존 HLS 중심 Saker를 MediaMTX WebRTC 중심 실시간 스트리밍 구조로 전환한다.

**마일스톤 목표:**
- raw/sample/front stream 생성
- WebRTC/WHEP 재생 성공
- HLS fallback URL 정상
- Backend playback API 구현
- Frontend RealtimePlayer 구현

**M2 진입 조건:**
- [ ] raw/sample/front stream 생성 완료
- [ ] WebRTC 재생 테스트 성공
- [ ] WHEP 재생 테스트 성공
- [ ] HLS fallback URL 동작 확인
- [ ] Backend playback API 구현 및 테스트 완료
- [ ] Frontend RealtimePlayer 구현 및 테스트 완료

---

## M2. Server Deployment & GCS MVP

**목표:**
자체 서버 2대 구조에 신규 GCS MVP를 배포하고 외부 접속 가능한 상태로 만든다.

**마일스톤 목표:**
- Server-02 staging 배포
- Server-01 production 후보 배포
- HTTPS/WSS 구성
- Nginx reverse proxy 적용
- Docker Compose 운영 구조 확정

**M3 진입 조건:**
- [ ] Server-02 staging 배포 완료
- [ ] Server-01 production 후보 배포 완료
- [ ] HTTPS 인증서 설치 및 테스트 완료
- [ ] WSS 연결 테스트 성공
- [ ] Nginx reverse proxy 설정 완료 및 테스트
- [ ] Docker Compose 운영 구조 문서 작성 완료

---

## M3. Device, Telemetry & Map Foundation

**목표:**
카메라/드론/로봇/휴대폰/Edge Gateway가 붙을 수 있는 장비 등록, telemetry, 지도 표시 구조를 만든다.

**마일스톤 목표:**
- Device Registry 구현
- Telemetry API/WSS 구현
- 좌표/배터리/자세/속도 데이터 수신
- 지도 위치 표시
- 기본 알림 규칙 구현

**M4 진입 조건:**
- [ ] Device Registry API 구현 완료
- [ ] Device 등록/조회/수정/삭제 테스트 성공
- [ ] Telemetry API 구현 완료
- [ ] Telemetry WSS 연결 테스트 성공
- [ ] 좌표/배터리/자세/속도 데이터 수신 테스트 성공
- [ ] 지도 위치 표시 기능 구현 완료
- [ ] 기본 알림 규칙 구현 완료

---

## M4. AI Adapter, Group Permission & Control

**목표:**
교수팀 AI endpoint 또는 mock AI endpoint를 붙이고, 그룹 계층 권한과 제어 명령 구조를 구현한다.

**마일스톤 목표:**
- AI endpoint contract 구현
- AI result overlay/event 표시
- group hierarchy 구현
- 상위 그룹의 하위 그룹 조회 가능
- control command + ack 구조 구현

**M5 진입 조건:**
- [ ] AI endpoint contract 정의 완료
- [ ] AI endpoint integration 구현 완료
- [ ] AI result overlay 기능 구현 완료
- [ ] AI event 표시 기능 구현 완료
- [ ] group hierarchy 데이터 모델 구현 완료
- [ ] 상위/하위 그룹 조회 API 구현 및 테스트 완료
- [ ] control command 구조 구현 완료
- [ ] command ACK 메커니즘 구현 완료

---

## M5. TURN, Stability, Test & Final Delivery

**목표:**
TURN, 장애 복구, 성능 측정, 실증 문서, 최종 납품 패키지를 완성한다.

**마일스톤 목표:**
- TURN 서버 구성
- 5~16대 stream 부하 테스트
- GCS 지연 평균 2.0초 이내 측정
- 장애 복구 테스트
- 운영/배포/롤백 문서 완성

**완료 조건:**
- [ ] TURN 서버 구성 완료
- [ ] TURN 연결 테스트 성공
- [ ] 5대 stream 부하 테스트 완료
- [ ] 10대 stream 부하 테스트 완료
- [ ] 16대 stream 부하 테스트 완료
- [ ] GCS 지연 측정 평균 2.0초 이내 달성
- [ ] 장애 복구 테스트 시나리오 작성 및 실행 완료
- [ ] 운영 문서 작성 완료
- [ ] 배포 문서 작성 완료
- [ ] 롤백 문서 작성 완료
- [ ] 최종 납품 패키지 생성 완료

---

생성일: 2026-05-21
마일스톤 수: 6개 (M0 ~ M5)
