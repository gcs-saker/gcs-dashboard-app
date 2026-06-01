# GCS-Saker M7 dashboard first-frame smoke

## 목적
#210은 aiortc receiver 기준 WebRTC 첫 video frame 지연을 측정했다. #212는 dashboard player가 브라우저에서 실제 수신 상태를 드러내도록 계측 지점을 고정한다.

## Dashboard 계측
`WebRTCPlayer`는 다음 속성을 노출한다.

- `data-testid="webrtc-player"`
- `data-playback-status`
- `data-has-video-frame`
- `data-first-frame-latency-ms`

첫 video frame이 브라우저 video element의 `loadeddata` 이벤트로 확인되면 `data-has-video-frame="true"`가 되고, `data-first-frame-latency-ms`에 WHEP playback 시작 이후 ms 값이 들어간다.

## 확인 명령
```bash
scripts/m7_dashboard_first_frame_smoke.sh --check
```

single-node stack이 떠 있을 때 smoke page 접근성 확인:

```bash
scripts/m7_dashboard_first_frame_smoke.sh --run
```

실제 브라우저 자동화에서는 다음 selector를 기다린다.

```text
[data-testid='webrtc-player'][data-has-video-frame='true']
```

## 남은 한계
이 계측은 브라우저 video element가 첫 frame을 로드했는지를 기준으로 한다. 사람이 보는 화면의 paint 완료 시점은 다음 단계에서 browser automation screenshot 또는 video frame callback 기반으로 더 좁혀야 한다.

## 확인된 동작
Codex in-app browser에서 `http://127.0.0.1:18080/?streamingSmoke=1`을 열면 `/login?redirect=%2F%3FstreamingSmoke%3D1`로 이동한다. 현재 smoke dashboard도 `RequireAuth` 아래에 있으므로, 실제 브라우저 first-frame 자동화는 다음 단계에서 smoke user 세션을 만들거나 테스트 전용 로그인 절차를 포함해야 한다.

이 동작은 보안상 정상이다. streaming smoke라고 해서 인증을 우회하면 운영 dashboard와 다른 경로가 생기므로, 인증된 사용자 기준으로 측정해야 한다.
