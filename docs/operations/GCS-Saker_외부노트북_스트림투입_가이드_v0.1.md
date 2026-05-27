# GCS-Saker 외부 노트북 스트림 투입 가이드 v0.1

작성일: 2026-05-27 KST

## 목적

현장 장비가 없어도 다른 노트북의 웹캠을 사용해 Server-01 dashboard에 WebRTC stream을 넣고 viewer 화면에서 확인하는 절차를 정의한다.

## 접속 주소

- Dashboard: `https://a4ai.tplinkdns.com/`
- Login: `https://a4ai.tplinkdns.com/login`
- Webcam publisher: `https://a4ai.tplinkdns.com/?webcamPublisher=1`
- Test stream id: `raw.local.webcam`
- WHIP endpoint: `https://a4ai.tplinkdns.com/webrtc/raw/local/webcam/whip`
- WHEP endpoint: `https://a4ai.tplinkdns.com/webrtc/raw/local/webcam/whep`
- HLS fallback: `https://a4ai.tplinkdns.com/hls/raw/local/webcam/index.m3u8`

## 현재 주의사항

현재 Server-01은 자체서명 인증서를 사용한다. 브라우저에서 인증서 경고를 허용하면 dashboard 확인은 가능하다. 다만 카메라 권한과 WebRTC publish는 브라우저 보안 정책에 더 민감하므로, 외부 노트북 시험은 Let's Encrypt 인증서 적용 후 진행하는 것이 가장 안정적이다.

## 계정 준비

현재 로그인 화면은 `/login`에 있다. 회원가입 API는 존재하지만 signup 화면은 아직 주 라우팅에 연결되어 있지 않다.

임시 회원가입 API 형식:

```bash
curl -k -X POST https://a4ai.tplinkdns.com/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{
    "username": "tester01",
    "email": "tester01@example.test",
    "password": "replace-with-test-password",
    "inviteCode": "operator-provided-invite-code",
    "role": "viewer"
  }'
```

운영 기준:

- 초대코드는 운영자가 별도로 전달한다.
- 실제 비밀번호, invite code, operator token은 문서나 PR에 기록하지 않는다.
- 민간 사용자 시험 전에는 `/signup` UI를 dashboard 라우팅에 연결해야 한다.

## Publisher 노트북 절차

1. `https://a4ai.tplinkdns.com/login`에 접속한다.
2. 테스트 계정으로 로그인한다.
3. `https://a4ai.tplinkdns.com/?webcamPublisher=1`로 이동한다.
4. `Start preview`를 눌러 카메라와 마이크 권한을 허용한다.
5. preview 화면이 보이면 `Publish WebRTC`를 누른다.
6. 상태 badge가 `published`가 되는지 확인한다.

## Viewer 노트북 절차

1. `https://a4ai.tplinkdns.com/login`에 접속한다.
2. 테스트 계정으로 로그인한다.
3. dashboard에서 `raw.local.webcam` 또는 local webcam stream card를 선택한다.
4. player mode가 `webrtc`로 진입하는지 확인한다.
5. 첫 frame 표시 시간과 glass-to-glass latency를 기록한다.
6. WebRTC 실패 시 HLS fallback으로 전환되는지 확인한다.

## 성공 기준

- publisher preview가 뜬다.
- WHIP publish가 `published` 상태로 끝난다.
- viewer playback API가 `raw.local.webcam` playback URL을 반환한다.
- viewer에서 첫 frame이 표시된다.
- WebRTC 실패 시 전체 dashboard가 깨지지 않고 HLS fallback 또는 error 상태가 player 내부에 표시된다.

## 실패 시 확인

| 증상 | 확인 지점 |
| --- | --- |
| 인증서 경고 이후 카메라 권한이 안 뜸 | Let's Encrypt 인증서 적용 필요 |
| 로그인 실패 | `/auth/login`, 계정 role, DB seed |
| `WHIP publish failed` | `/webrtc/.../whip`, edge log, MediaMTX log |
| viewer에서 401 | 로그인 token 저장 상태 |
| viewer에서 WHEP 실패 | stream이 publish 중인지, `/webrtc/.../whep` |
| ICE failed | `8189/udp/tcp` 조건부 개방 또는 TURN 필요 |

## 다음 개선

- `/signup` UI 연결
- publisher page에 latency timestamp overlay 추가
- viewer first-frame 자동 측정
- publisher 권한을 operator 이상으로 제한할지 결정
- production 모드에서 테스트 publisher 노출 여부를 feature flag로 제어
