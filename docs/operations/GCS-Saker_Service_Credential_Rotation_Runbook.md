# GCS-Saker 내부 서비스 자격증명 교체

## 범위

이 절차는 Server-01의 내부 서비스 자격증명만 교체한다. 모바일 코드, 모바일 이미지,
모바일 계정과 모바일 배포 설정은 변경하지 않는다.

서로 다른 비밀값을 유지해야 하는 경계는 다음과 같다.

- `MEDIA_CONTROL_PUBLISH_TOKEN`: 짧은 media session token 암호화
- `MEDIA_CONTROL_GRPC_TOKEN`: media-control 내부 gRPC listener 인증
- `AUTH_POLICY_RPC_TOKEN`: media-control에서 auth-policy로 향하는 내부 RPC 인증
- `AUTH_POLICY_AUDIT_INGEST_TOKEN`: media lifecycle 감사 ingest 인증
- `TURN_SHARED_SECRET`: coturn REST 방식 임시 credential 발급

각 값은 32자 이상의 독립 난수여야 한다. 다른 용도의 값을 복사하거나 fallback으로 재사용하지 않는다.

## gRPC 및 감사 ingest 무중단 교체

1. 새 값을 current 변수에 배치하고 기존 값을 corresponding `*_PREVIOUS_TOKEN`에 배치한다.
2. auth-policy를 먼저 재시작해 current와 previous를 동시에 검증하게 한다.
3. media-control을 재시작해 새 current 값만 송신하게 한다.
4. 정상 요청과 이전 값 거부 전환 시점을 감사 로그로 확인한다.
5. 허용된 교체 창이 끝나면 previous 변수를 비우고 auth-policy를 다시 재시작한다.

previous 값은 검증 전용이다. 신규 요청을 서명하거나 발급하는 데 사용하지 않는다. current와 previous가
같거나 32자 미만이면 서비스는 시작 단계에서 실패해야 한다.

previous 값은 기본 Compose 환경에 두지 않는다. 교체 기간에만
`compose.credential-rotation.override.yml`을 추가해 service-scoped secret 파일로 제공하고,
새 current token 검증이 끝나면 override를 제거한다.

## publish secret 교체

media token은 최대 5분 TTL과 stream, action, group, session binding을 가진다. publish secret 교체 전에는
신규 세션 발급을 잠시 중단하고 기존 token TTL이 끝날 때까지 기다린 뒤 media-control을 새 secret으로
순차 재시작한다. 기존 WebRTC 연결은 종료하지 않으며, 재접속 클라이언트는 서버에서 새 session token을
다시 받아야 한다.

## TURN shared secret 교체

TURN credential은 서버가 짧은 TTL로 발급한다. 기존 credential TTL이 끝나는 시점을 기준으로
media-control과 coturn의 secret을 같은 변경 창에서 교체한다. 장시간 정적 TURN password로 대체하지 않는다.

## 검증 및 롤백

- current 값 성공, 잘못된 값과 제거된 previous 값 실패
- 만료 media/TURN credential 실패
- token, credential, private route가 로그와 오류 응답에 없음
- 다른 그룹, 다른 session, 변경된 credential version의 media token 실패
- 실패 시 current를 이전 값으로 되돌리고 previous는 비운 상태로 재시작

모든 결과는 `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN` 중 하나로 기록한다. 실제 credential 원문은 증거에
포함하지 않고 fingerprint와 교체 시각만 기록한다.
