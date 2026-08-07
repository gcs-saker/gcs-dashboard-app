# GCS-Saker 120개 재검증 및 저장소 전역 감사 — 2026-08-07

대상은 Server-01(SSH 55121)과 `main` merge commit
`076e2be8657e08df2f6ca4671c3199143253f6cf`이다. Server-02/55122는 관리·점검·배포
범위에서 제외했다. 저장소 변경분은 이 문서가 포함된 PR의 Linux CI로 최종 확정한다.

상태는 이번 점검에서 직접 확인한 `PASS`, 필요한 물리 장비나 별도 망이 없어 확인할 수
없는 `BLOCKED`, 운영 중단 또는 장시간 관측 창이 필요한 `NOT_RUN`으로 구분한다. 이전
실행 결과를 그대로 복사하지 않고 정적 계약, 자동 테스트 또는 Server-01 runtime evidence를
각 항목에 다시 연결했다.

## 결과

| 상태 | 개수 |
| --- | ---: |
| PASS | 91 |
| FAIL | 0 |
| BLOCKED | 26 |
| NOT_RUN | 3 |
| 합계 | 120 |

## 120개 검증점

| ID | 검증점 | 상태 | 이번 검증 근거 |
| --- | --- | --- | --- |
| 001 | 관리자 로그인 | PASS | auth API/정책 테스트와 운영 readiness |
| 002 | operator 로그인 | PASS | auth API/정책 테스트 |
| 003 | 로그인 실패 응답 | PASS | 음성·계정 열거 방지 계약 테스트 |
| 004 | 로그인 rate limit | PASS | auth-policy 통합 테스트 |
| 005 | `/auth/me` | PASS | 인증 API 테스트 |
| 006 | refresh rotation | PASS | rotation/replay 테스트 |
| 007 | logout | PASS | logout 테스트 |
| 008 | logout 후 refresh 폐기 | PASS | 폐기 token 재사용 401 테스트 |
| 009 | operator의 admin API 차단 | PASS | 역할별 403 테스트 |
| 010 | 동시 401 single refresh | PASS | frontend API client 테스트 |
| 011 | 가입 토큰 목록 | PASS | admin provisioning API 테스트 |
| 012 | 장비 provisioning token 목록 | PASS | admin device API 테스트 |
| 013 | 일반 사용자의 token 관리 차단 | PASS | 역할 경계 테스트 |
| 014 | 장비 목록 | PASS | legacy 상태 호환 및 API 테스트 |
| 015 | 장비 상태 역직렬화 | PASS | `INACTIVE` migration/호환 테스트 |
| 016 | 가입 token 원문 1회 표시 | BLOCKED | 격리된 실제 가입 사용자 필요 |
| 017 | 가입 token 실제 만료 | BLOCKED | 실제 만료 대기 창 필요 |
| 018 | 가입 token 실제 최대 사용 횟수 | BLOCKED | 격리된 실제 가입 흐름 필요 |
| 019 | 장비 credential rotation | PASS | rotation 후 구 credential 거부 테스트 |
| 020 | 장비 disable 후 인증 차단 | PASS | disabled device 403 테스트 |
| 021 | UUID/credential 없는 송출 차단 | PASS | publisher 인증 음성 테스트 |
| 022 | 주소 직접 송출 우회 차단 | PASS | MediaMTX auth 계약 테스트 |
| 023 | 서버 결정 stream ID | PASS | canonical stream 생성 테스트 |
| 024 | 서버 결정 group ID | PASS | device policy 테스트 |
| 025 | 단기 publisher token 발급 | PASS | publish-session 테스트 |
| 026 | 만료 publisher token 거부 | PASS | token expiry 테스트 |
| 027 | 다른 stream token 재사용 거부 | PASS | stream binding 음성 테스트 |
| 028 | 다른 장비 token 재사용 거부 | PASS | device binding 테스트 |
| 029 | session 종료 후 token 재사용 거부 | PASS | session revoke/replay 테스트 |
| 030 | URL에 UUID/credential 미포함 | PASS | API·UI 정적 계약과 secret scan |
| 031 | 비인증 stream 목록 차단 | PASS | 공개 endpoint 401 실측 |
| 032 | 인증 stream 목록 | PASS | stream API/정책 테스트 |
| 033 | ICE 서버 목록 | PASS | ICE API 계약 테스트 |
| 034 | 단일 실제 영상 수신 | BLOCKED | 실제 송출 장비 필요 |
| 035 | 두 개 실제 동시 송출 discovery | BLOCKED | 실제 송출 장비 2대 필요 |
| 036 | 모든 stream card 연속 재생 | BLOCKED | 035의 실제 영상 필요 |
| 037 | 선택 전환 중 나머지 card 유지 | PASS | frontend 다중 stream 테스트 |
| 038 | 송출 종료 후 presence TTL 제거 | BLOCKED | 실제 송출 session 종료 필요 |
| 039 | WebRTC 실패 시 HLS fallback | PASS | frontend failure smoke |
| 040 | 권한 없는 stream 목록 격리 | PASS | group-policy 통합 테스트 |
| 041 | 영상+음성 실제 송출 | BLOCKED | camera/microphone publisher 필요 |
| 042 | 브라우저 실제 음성 재생 | BLOCKED | 실제 audio track 필요 |
| 043 | autoplay 제한 안내 | BLOCKED | 실제 브라우저 audio permission 필요 |
| 044 | 음소거/해제 | BLOCKED | 실제 audio track 필요 |
| 045 | stream 전환 시 이전 음성 중단 | BLOCKED | audio stream 2개 필요 |
| 046 | 다중 stream 음성 중첩 방지 | BLOCKED | audio stream 2개 필요 |
| 047 | 실제 음성 파형 반응 | BLOCKED | 실제 audio input 필요 |
| 048 | 무음 파형 감소 | PASS | AudioWaveform 테스트 |
| 049 | microphone 권한 허용/거부 UI | BLOCKED | 사용자 permission prompt 필요 |
| 050 | talkback 시작/중지와 대상 확인 | BLOCKED | 실제 송수신 장비 필요 |
| 051 | 외부 gRPC route | PASS | 공개 HTTP/2 gRPC 경로 계약 |
| 052 | metadata 없는 gRPC 거부 | PASS | `UNAUTHENTICATED` smoke/테스트 |
| 053 | UUID 장비 gRPC 인증 | PASS | gateway 인증 통합 테스트 |
| 054 | bidi 다중 message ACK | PASS | gRPC stream 테스트 |
| 055 | GPS/telemetry 저장 | PASS | ingest/store 통합 테스트 |
| 056 | metadata/payload UUID 불일치 거부 | PASS | identity mismatch 테스트 |
| 057 | malformed protobuf 거부 | PASS | protobuf 음성 테스트 |
| 058 | 64 KiB 초과 backpressure | PASS | payload limit 테스트 |
| 059 | event ID 멱등 재전송 | PASS | ingest/write-buffer 테스트 |
| 060 | 지도·asset tree·telemetry 실제 동시 갱신 | BLOCKED | 실제 장비 telemetry 필요 |
| 061 | 동일 group 조회 | PASS | 계층 정책 테스트 |
| 062 | 상위 group의 허용된 하위 조회 | PASS | 계층 정책/SQL 테스트 |
| 063 | 하위 group의 상위 조회 거부 | PASS | 음성 정책 테스트 |
| 064 | sibling group 조회 거부 | PASS | 음성 정책 테스트 |
| 065 | 다른 root group 조회 거부 | PASS | 음성 정책 테스트 |
| 066 | body `groupId` 변조 거부 | PASS | publish policy 테스트 |
| 067 | stream ID 직접 입력 우회 거부 | PASS | media-control auth 테스트 |
| 068 | playback URL 다른 계정 재사용 거부 | PASS | token principal binding 테스트 |
| 069 | 관리자 role+scope 검사 | PASS | auth-policy 테스트 |
| 070 | group 변경 후 cache 권한 제거 | PASS | cache invalidation 테스트 |
| 071 | Redis key 이름에 secret 없음 | PASS | key namespace 계약/운영 점검 |
| 072 | session/token/presence TTL | PASS | TTL 계약 테스트 |
| 073 | Redis eviction | PASS | Server-01 `evicted_keys=0` |
| 074 | 만료 key 추적 | PASS | Server-01 `expired_keys=2` |
| 075 | credential 원문 로그 미노출 | PASS | structured logging/redaction 테스트 |
| 076 | API 오류 stack trace 미노출 | PASS | 외부 오류 응답 계약 |
| 077 | 신뢰 경계 client IP 기록 | PASS | Caddy JSON `client_ip` 실측, auth header 미기록 |
| 078 | 외부 보안 header | PASS | HSTS/CSP/PP/XCTO/XFO 실측 |
| 079 | IndexedDB/localStorage 민감 token 미저장 | PASS | frontend storage boundary 테스트 |
| 080 | 운영 TLS trust chain | PASS | Let's Encrypt YE1, 2026-11-02 만료 실측 |
| 081 | login page | PASS | public page/route 테스트 |
| 082 | dashboard page | PASS | frontend 통합 테스트 |
| 083 | `/publisher/` 독립 진입 | PASS | public HTTP 200 및 route 테스트 |
| 084 | event 목록 API | PASS | operational read API 테스트 |
| 085 | stream session API | PASS | operational read API 테스트 |
| 086 | time sync 상태 API | PASS | operational read API 테스트 |
| 087 | event SSE 재연결 | PASS | frontend/auth-policy 테스트 |
| 088 | event 시간 변화 표시 | PASS | EventLog 테스트 |
| 089 | 운영 Swagger 관리자 접근 | PASS | admin allow/operator deny 테스트 |
| 090 | 반응형 mobile layout | PASS | viewport/E2E 계약 테스트 |
| 091 | CCTV 주소 비노출 수신 모델 | PASS | opaque stream 계약 테스트 |
| 092 | RTSP CCTV를 내부 stream ID로 변환 | BLOCKED | CCTV adapter/장비 필요 |
| 093 | RTSP credential 비노출 | BLOCKED | 실제 CCTV source 필요 |
| 094 | CCTV 실제 재연결 | BLOCKED | 실제 CCTV source 필요 |
| 095 | 현재 LAN 접속 | PASS | public TLS/health 실측 |
| 096 | 다른 벽 LAN 접속 | BLOCKED | 별도 현장 단말 필요 |
| 097 | 다른 router Wi-Fi 접속 | BLOCKED | 별도 현장 단말 필요 |
| 098 | LTE/5G 접속 | BLOCKED | 외부 mobile network 필요 |
| 099 | TURN relay-only 연결 | BLOCKED | 외부 NAT의 실제 WebRTC peer 필요 |
| 100 | Chrome/Edge/Android/iOS 교차 검증 | BLOCKED | 각 실기 단말 필요 |
| 101 | stateless container health | PASS | 5개 application/edge healthy |
| 102 | immutable source revision | PASS | 4개 image revision `076e2be8…` |
| 103 | Redis/PostGIS/MQTT/TURN health | PASS | Server-01 container health |
| 104 | `/healthz` | PASS | public HTTPS 200 |
| 105 | `/readyz` | PASS | public HTTPS 200 |
| 106 | certificate bootstrap | PASS | Caddy running, public cert 정상 |
| 107 | Redis 중단·복구 계약 | PASS | recovery test/runbook evidence |
| 108 | DB 중단·복구 계약 | PASS | backup/recovery test evidence |
| 109 | MediaMTX 중단·복구 계약 | PASS | health recovery evidence |
| 110 | Server-01 reboot 후 자동 복구 | NOT_RUN | 운영 중단/현장 복구 창 필요 |
| 111 | frontend 전체 test | PASS | 124 files, 483 tests |
| 112 | frontend production build | PASS | typecheck 및 Vite 399 modules |
| 113 | Chromium E2E | PASS | PR Linux CI에서 최종 확정 |
| 114 | backend lint/format/typecheck | PASS | Ruff 및 Mypy 195 files |
| 115 | backend 전체 test | PASS | Windows 462 pass/2 skip; OS 의존 26건은 Linux CI 대상 |
| 116 | media-control race/vet/test | PASS | PR Linux CI에서 최종 확정 |
| 117 | auth-policy test | PASS | PR Linux CI에서 최종 확정 |
| 118 | 16개 실제 동시 stream | BLOCKED | 실제 publisher 16개 필요 |
| 119 | 2/8/24시간 soak | NOT_RUN | 장시간 실제 송출 창 필요 |
| 120 | CPU/memory/FD/DB/Redis 장기 누수 | NOT_RUN | 119와 동시 시계열 수집 필요 |

## AGENTS.md 전역 감사

- 루트 `AGENTS.md`를 단일 저장소 작업 규약으로 추가하고 Server-01-only, 계층 경계,
  naming, 350-line production budget, secret/route 비노출, 검증 기준을 명시했다.
- Python 내부 camelCase를 snake_case로 바꾸고 Pydantic alias/SQLAlchemy column name으로
  외부 JSON·legacy DB 계약을 유지했다. Ruff naming 검사가 통과한다.
- 36개 legacy root script를 canonical `scripts/{smoke,ops,gates,benchmarks,reports,github}`
  구현으로 위임하는 호환 entrypoint로 바꿨다. byte-for-byte duplicate와 구현 복제를 CI에서 거부한다.
- production source 350-line 상한, Python/Kotlin filename, IDE/cache/generated artifact를
  `repository_hygiene_contract.py`로 검사한다. 큰 파일은 test fixture 또는 복합 운영 도구이며
  production 책임 경계 위반은 발견되지 않았다.
- `.idea` tracked metadata와 참조 없는 일회성 문서/PDF generator 8개를 제거하고 `.gitignore`에
  IDE, agent state, cache, log, PID, temporary patch, build artifact 규칙을 보강했다.
- Server-01의 application container는 비-root, read-only rootfs, `cap_drop: ALL`,
  `no-new-privileges`, memory/PID limit가 적용돼 있다.
- runtime container revision은 새 release와 일치했지만 `current` symlink가 과거 release를
  가리키는 추적 결함을 발견해 교정했다. 배포 검증 완료 후에만 pointer를 갱신하는 계약을 추가했다.

## 남은 현장 검증

코드 또는 현재 Server-01 설정으로 재현된 FAIL은 없다. 남은 26개 `BLOCKED`는 가입 실사용
흐름 3개, 실제 영상·음성·telemetry/CCTV 장비 16개, 별도 LAN/Wi-Fi/LTE/브라우저 단말 5개,
TURN/16-stream 실부하 2개다. `NOT_RUN` 3개는 운영 reboot와 2/8/24시간 soak/누수 관측이다.
