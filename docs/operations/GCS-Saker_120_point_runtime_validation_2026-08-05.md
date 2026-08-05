# GCS-Saker 120-point runtime validation — 2026-08-05

검증 대상은 PR #601의 `4ee64b0190a2a1e10a5ec918097884b662db3490`과 양 서버에 배포된
`158d322e540ab9ff2b3475570a2c95b240b86f2f`이다. 운영은 SSH 55121, staging은 SSH 55122이다.

상태 의미:

- `PASS`: 이번 점검에서 직접 실행하고 기대 결과를 확인했다.
- `FAIL`: 이번 점검에서 기대 결과와 다른 동작을 재현했다.
- `BLOCKED`: 선행 결함 또는 필요한 외부 장비/네트워크가 없어 완료할 수 없다.
- `NOT_RUN`: 서비스 중단이나 운영 데이터 변경을 수반해 이번 점검에서 의도적으로 실행하지 않았다.

## A. 사용자 인증과 세션 (001–010)

| ID | 검증 포인트 | 상태 | 증거/결과 |
| --- | --- | --- | --- |
| 001 | 운영 관리자 로그인 | PASS | 55121 login 200 |
| 002 | 운영 operator 로그인 | PASS | 55121 login 200 |
| 003 | staging 관리자 로그인 | PASS | 55122 login 200 |
| 004 | staging operator 로그인 | FAIL | 컨테이너 설정 credential로 401 |
| 005 | `/auth/me` | PASS | 운영 operator bearer로 200 |
| 006 | refresh rotation | PASS | refresh 200 |
| 007 | logout | PASS | logout 204 |
| 008 | logout 후 refresh 폐기 | PASS | 재사용 401 |
| 009 | operator의 admin API 차단 | PASS | admin API 4개 모두 403 |
| 010 | 동시 401 시 single refresh | PASS | 프론트 단위/통합 테스트 및 CI 통과 |

## B. 가입 토큰과 장비 관리 (011–020)

| ID | 검증 포인트 | 상태 | 증거/결과 |
| --- | --- | --- | --- |
| 011 | 가입 토큰 목록 조회 | PASS | 양 서버 admin 200 |
| 012 | Provisioning Token 목록 조회 | PASS | 양 서버 admin 200 |
| 013 | 일반 사용자 토큰 관리 차단 | PASS | operator 403 |
| 014 | 장비 목록 조회 | FAIL | 양 서버 500 |
| 015 | 장비 상태 역직렬화 | FAIL | DB `INACTIVE`를 현재 Enum이 처리하지 못함 |
| 016 | 가입 토큰 신규 발급·원문 1회 표시 | BLOCKED | 운영 데이터 생성 전 014 수정 필요 |
| 017 | 가입 토큰 만료 거부 | BLOCKED | 실행 가능한 신규 시험 토큰 없음 |
| 018 | 가입 토큰 최대 사용 횟수 | BLOCKED | 실행 가능한 신규 시험 토큰 없음 |
| 019 | 장비 credential rotation | BLOCKED | 장비 관리 API 500 |
| 020 | 장비 disable 후 인증 차단 | BLOCKED | 장비 관리 API 500 |

## C. 장비 송출 세션 보안 (021–030)

| ID | 검증 포인트 | 상태 | 증거/결과 |
| --- | --- | --- | --- |
| 021 | UUID/credential 없는 송출 차단 | PASS | RTSP ANNOUNCE 401, 보호 정책 활성 |
| 022 | 주소 직접 송출 우회 차단 | PASS | staging 직접 RTSP publish 401 |
| 023 | 서버 결정 stream ID | BLOCKED | 유효 시험 장비 조회 불가 |
| 024 | 서버 결정 group ID | BLOCKED | 유효 시험 장비 조회 불가 |
| 025 | 단기 publisher token 발급 | BLOCKED | 유효 UUID/credential 없음 |
| 026 | 만료 publisher token 거부 | BLOCKED | 시험 token 발급 불가 |
| 027 | 다른 stream에 token 재사용 거부 | BLOCKED | 시험 token 발급 불가 |
| 028 | 다른 장비의 token 재사용 거부 | BLOCKED | 시험 장비 두 대 필요 |
| 029 | 세션 종료 후 token 재사용 거부 | BLOCKED | 시험 token 발급 불가 |
| 030 | URL에 UUID/credential 미포함 | PASS | 정적 계약·CI 및 공개 route 구조 확인 |

## D. 스트림 수신과 다중 스트림 (031–040)

| ID | 검증 포인트 | 상태 | 증거/결과 |
| --- | --- | --- | --- |
| 031 | 비인증 stream 목록 차단 | PASS | 외부 `/media-control/api/v1/streams` 401 |
| 032 | 인증 stream 목록 조회 | PASS | 양 서버 admin/operator 200(단 staging operator 제외) |
| 033 | ICE 서버 목록 조회 | PASS | 인증 요청 200 |
| 034 | 단일 실제 영상 수신 | BLOCKED | 인증서 결함과 유효 publisher 없음 |
| 035 | 2개 실제 동시 송출 discovery | BLOCKED | 주소 직접 송출은 정책상 401, 장비 세션 발급 불가 |
| 036 | 모든 스트림 카드 연속 재생 | BLOCKED | 034–035 선행 필요 |
| 037 | 선택 스트림 전환 중 나머지 카드 유지 | PASS | 렌더링/UI 테스트 491개 묶음 통과 |
| 038 | 송출 종료 후 presence TTL 제거 | BLOCKED | 유효 송출 세션 없음 |
| 039 | WebRTC 실패 시 HLS fallback | PASS | 프론트 failure smoke 및 CI 통과 |
| 040 | 권한 없는 stream 목록 격리 | PASS | 정책/저장소 통합 테스트 및 CI 통과 |

## E. 오디오와 Talkback (041–050)

| ID | 검증 포인트 | 상태 | 증거/결과 |
| --- | --- | --- | --- |
| 041 | 영상+음성 실제 송출 | BLOCKED | 마이크/모바일 publisher 필요 |
| 042 | 브라우저 실제 음성 재생 | BLOCKED | TLS와 실제 송출 선행 필요 |
| 043 | autoplay 제한 안내 | BLOCKED | 브라우저가 인증서에서 차단됨 |
| 044 | 음소거/해제 | BLOCKED | 실제 오디오 track 필요 |
| 045 | 스트림 전환 시 이전 음성 중단 | BLOCKED | 2개 오디오 stream 필요 |
| 046 | 다중 stream 음성 중첩 방지 | BLOCKED | 2개 오디오 stream 필요 |
| 047 | 음성 파형 반응 | BLOCKED | 실제 오디오 track 필요 |
| 048 | 무음 시 파형 감소 | PASS | AudioWaveform 컴포넌트 테스트 통과 |
| 049 | 마이크 권한 허용/거부 UI | BLOCKED | 사용자 권한 prompt가 필요 |
| 050 | 마이크 송신 시작/중지와 대상 확인 | BLOCKED | 실제 마이크와 수신 장비 필요 |

## F. gRPC Telemetry/GPS/Geometry (051–060)

| ID | 검증 포인트 | 상태 | 증거/결과 |
| --- | --- | --- | --- |
| 051 | 외부 gRPC route 존재 | PASS | `Exchange` 호출이 nginx 405가 아닌 gRPC 응답 도달 |
| 052 | metadata 없는 gRPC 거부 | PASS | `Unauthenticated: unauthorized_gateway_metadata` |
| 053 | 유효 UUID 장비 gRPC 연결 | BLOCKED | admin device API 500으로 시험 credential 확보 불가 |
| 054 | 양방향 다중 메시지 ACK | BLOCKED | 053 선행 필요 |
| 055 | GPS/telemetry 저장 | BLOCKED | 053 선행 필요 |
| 056 | metadata/request/telemetry UUID 불일치 거부 | PASS | protocol 통합 테스트 통과 |
| 057 | 잘못된 protobuf 거부 | PASS | protocol 통합 테스트 통과 |
| 058 | 64 KiB 초과 backpressure | PASS | media-control 테스트 통과 |
| 059 | event ID 멱등 재전송 | PASS | telemetry ingest/write-buffer 테스트 통과 |
| 060 | 지도·자산 트리·telemetry 동시 갱신 | BLOCKED | 실제 telemetry 송신과 브라우저 필요 |

## G. 계층형 그룹 보안 (061–070)

| ID | 검증 포인트 | 상태 | 증거/결과 |
| --- | --- | --- | --- |
| 061 | 동일 그룹 조회 | PASS | 정책 테스트 통과 |
| 062 | 상위 그룹의 허용된 하위 조회 | PASS | 정책/SQL 테스트 통과 |
| 063 | 하위 그룹의 상위 조회 거부 | PASS | 정책 테스트 통과 |
| 064 | 형제 그룹 조회 거부 | PASS | 정책 테스트 통과 |
| 065 | 다른 루트 그룹 조회 거부 | PASS | 정책 테스트 통과 |
| 066 | body `groupId` 변조 거부 | PASS | device publish policy 테스트 통과 |
| 067 | stream ID 직접 입력 우회 거부 | PASS | media-control auth 테스트 통과 |
| 068 | playback URL 다른 계정 재사용 거부 | PASS | token binding 테스트 통과 |
| 069 | 관리자 역할+관리 범위 검사 | PASS | auth-policy 테스트 통과 |
| 070 | 그룹 변경 후 기존 cache 권한 제거 | PASS | cache invalidation 테스트 통과 |

## H. Secret, Redis, 로그와 감사 (071–080)

| ID | 검증 포인트 | 상태 | 증거/결과 |
| --- | --- | --- | --- |
| 071 | Redis key 이름에 credential/password/secret 없음 | PASS | 운영 21개, staging 25개 key 검사 결과 0 |
| 072 | session/token/presence key TTL 누락 없음 | PASS | 양 서버 `TTL=-1` 0개 |
| 073 | Redis eviction 없음 | PASS | 양 서버 `evicted_keys=0` |
| 074 | 만료 key 추적 | PASS | 운영 85, staging 279 expired 기록 |
| 075 | Credential 원문 로그 미노출 | PASS | 구조화 logging/masking 계약과 최근 로그 점검 |
| 076 | API 오류에서 stack trace 미노출 | PASS | 외부 401/403/500 응답 계약 확인 |
| 077 | 신뢰 경계 IP 로깅 | BLOCKED | container edge에는 내부 proxy IP만 기록됨; root 전용 host nginx 설정 확인 필요 |
| 078 | 외부 보안 헤더 | FAIL | public 응답에 HSTS/CSP/Permissions-Policy/XFO가 없음 |
| 079 | IndexedDB/localStorage 민감 token 미저장 | PASS | 프론트 저장 경계 테스트 통과 |
| 080 | 운영 TLS trust chain | FAIL | self-signed CN/issuer `a4ai.tplinkdns.com`, verify code 18 |

## I. 대시보드·이벤트·운영 설정 (081–090)

| ID | 검증 포인트 | 상태 | 증거/결과 |
| --- | --- | --- | --- |
| 081 | 로그인 페이지 실제 표시 | FAIL | 브라우저 `ERR_CERT_AUTHORITY_INVALID` |
| 082 | Dashboard 실제 표시 | FAIL | TLS 선행 차단 |
| 083 | `/publisher` 독립 진입 | FAIL | TLS 선행 차단; HTTP 계층은 `/publisher/` 308 정상 |
| 084 | 이벤트 목록 API | PASS | 인증 요청 200 |
| 085 | stream session API | PASS | 인증 요청 200 |
| 086 | 시간 동기화 상태 API | PASS | 인증 요청 200 |
| 087 | 이벤트 SSE 재연결 | PASS | 프론트 및 auth-policy 테스트 통과 |
| 088 | 이벤트 시간 변화 표시 | PASS | EventLog 패널 테스트 통과 |
| 089 | 운영 Swagger 관리자 접근 | PASS | admin 200, operator 403 |
| 090 | 반응형·모바일 실제 화면 | BLOCKED | TLS 수정 후 실기 viewport 확인 필요 |

## J. CCTV와 외부 네트워크 (091–100)

| ID | 검증 포인트 | 상태 | 증거/결과 |
| --- | --- | --- | --- |
| 091 | CCTV 주소 비노출 수신 모델 | PASS | 컴포넌트/계약 정적 검증 |
| 092 | RTSP CCTV를 내부 stream ID로 변환 | BLOCKED | 실제 CCTV adapter 미구현/장비 없음 |
| 093 | RTSP credential 비노출 | BLOCKED | 실제 CCTV source 없음 |
| 094 | CCTV 재연결 | BLOCKED | 실제 CCTV source 없음 |
| 095 | 같은 LAN 접속 | PASS | 현재 PC에서 443 TCP 도달 |
| 096 | 다른 벽 LAN 접속 | BLOCKED | 별도 단말 필요 |
| 097 | 다른 공유기 Wi-Fi 접속 | BLOCKED | 별도 단말 필요 |
| 098 | LTE/5G 접속 | BLOCKED | 모바일 외부망 필요 |
| 099 | TURN relay-only 연결 | BLOCKED | 실제 WebRTC peer와 외부 NAT 필요 |
| 100 | Chrome/Edge/Android/iOS 교차 브라우저 | BLOCKED | TLS 수정 및 단말 필요 |

## K. 운영 상태와 장애 복구 (101–110)

| ID | 검증 포인트 | 상태 | 증거/결과 |
| --- | --- | --- | --- |
| 101 | 운영 stateless 컨테이너 health | PASS | edge/backend/dashboard/auth/media 모두 healthy |
| 102 | staging stateless 컨테이너 health | PASS | edge/backend/dashboard/auth/media 모두 healthy |
| 103 | Redis/PostGIS/MQTT/TURN health | PASS | 양 서버 상태 서비스 healthy |
| 104 | `/healthz` | PASS | 양 서버 200 |
| 105 | `/readyz` | PASS | 양 서버 200 |
| 106 | 인증서 bootstrap 서비스 | FAIL | 운영 `gcs-cert-bootstrap` restart loop, 443 bind conflict |
| 107 | Redis 중단·복구 | NOT_RUN | 명시적 staging 장애 시간 확보 필요 |
| 108 | DB 중단·복구 | NOT_RUN | 운영 데이터 영향 가능, 백업 확인 선행 필요 |
| 109 | MediaMTX 중단·복구 | NOT_RUN | 활성 송출 영향 확인 후 staging에서 수행 필요 |
| 110 | 서버 재부팅 후 자동 복구 | NOT_RUN | SSH/현장 복구 창 확보 필요 |

## L. 부하·장시간 안정성 (111–120)

| ID | 검증 포인트 | 상태 | 증거/결과 |
| --- | --- | --- | --- |
| 111 | 프론트 전체 테스트 | PASS | 125 files, 491 tests |
| 112 | 프론트 production build | PASS | 399 modules, build 성공 |
| 113 | Chromium E2E | PASS | 2/2 성공 |
| 114 | 백엔드 lint/format/typecheck | PASS | Ruff/Mypy 성공 |
| 115 | 백엔드 테스트 | PASS | Linux CI 전체 성공; Windows 449 pass/26 OS 의존 실패 |
| 116 | media-control race/vet/test | PASS | GitHub CI 성공 |
| 117 | auth-policy test | PASS | GitHub CI 성공 |
| 118 | 16개 동시 stream acceptance | BLOCKED | 유효 장비 송출 세션과 TLS 필요 |
| 119 | 2/8/24시간 soak | NOT_RUN | 연속 시험 시간 및 실제 송출원 필요 |
| 120 | CPU/메모리/FD/DB/Redis 장기 누수 | NOT_RUN | 119 실행 중 시계열 수집 필요 |

## 현재 결론

- PASS: 65
- FAIL: 9
- BLOCKED: 40
- NOT_RUN: 6
- 합계: 120

우선 복구 순서는 `080/081/082/083/106` TLS, `014/015` 장비 Enum 데이터 호환성,
`004` staging operator seed drift이다. 이 세 결함을 해결해야 실제 장비 송출·다중 스트림·오디오·GPS 검증을 이어갈 수 있다.

## 2026-08-05 복구 및 재검증 업데이트

최종 애플리케이션 배포 기준은 `32302fcca6ba84d7e48f003d709d0683ce033e59`이다. 운영(55121)과
staging(55122)의 `current` release를 모두 이 커밋으로 전환했다. GitHub Actions run
`30971385119`의 repository, frontend, backend, auth-policy, media-control 검증은 모두 성공했다.

- 004: staging operator seed credential을 복구했고, 재기동 후 admin/operator 모두 200을 확인했다.
- 014/015: legacy `INACTIVE`를 `DISABLED`로 정규화하는 V13 migration과 읽기 호환 계층을 배포했다.
  양 서버의 `/admin/devices`가 200을 반환한다.
- 019/020, 023–029: 가상 장비로 publish session 생성 201, 갱신 200, 갱신 token replay 401,
  credential rotation 후 구 credential 403, 새 credential 201, disable 후 403을 확인했다.
- 주소 없는 등록: 센서만 등록해도 서버가 UUID 기반 canonical stream을 생성하도록 수정했다. staging에서
  `streamPaths` 1개 자동 생성을 확인했다.
- 053–055: UUID/credential 전용 gRPC bidi stream으로 GPS/telemetry를 송신해
  `GATEWAY_ACK_STATUS_ACCEPTED`, reason `accepted`를 확인했다. 시험 credential은 즉시 회전하고 장비는
  비활성화했으며 임시 secret 파일을 삭제했다.
- 107–109: staging DB dump(restore용 custom format)를 먼저 생성한 뒤 Redis, PostgreSQL, MediaMTX를
  각각 재시작했다. Redis/PostgreSQL health, MediaMTX 내부 API, 전체 `/healthz`와 `/readyz`가 복구됐다.
- seed drift 재발 방지: 설정으로 주입된 초기 admin/operator identity를 시작 시 DB와 동기화하도록 수정했다.
  운영과 staging 모두 실제 재기동 후 두 역할 로그인 200을 확인했다.
- CI 경쟁 조건: lazy operations settings를 기본 1초만 기다리던 테스트를 10초 bounded wait로 변경했고,
  로컬 19/19 및 최종 CI 전체 성공을 확인했다.

아직 완료되지 않은 공개 edge 항목은 077/078/080–083/090/100/106이다. 원인은 운영 host nginx가 443을
점유해 Caddy ACME edge가 기동하지 못하는 것이며, 현재도 self-signed chain이다. 준비된 Caddy 설정에는
HSTS, CSP, Permissions-Policy, X-Content-Type-Options, X-Frame-Options, Referrer-Policy와 server header 제거가
포함되어 있다. 운영 OS에서 `sudo systemctl disable --now nginx` 실행 후 `gcs-cert-bootstrap`을 재시작해야
외부 브라우저 검증을 완료할 수 있다. 이 전환은 sudo 권한이 필요한 수동 운영 단계다.
