# GCS-SAKER Local Webcam WebRTC Test Harness

## 목적

M2에서 현장 카메라가 없어도 개발자 노트북/모니터 캠으로 WebRTC 입력 경로를 점검한다.

## 실행 경로

- Publisher page: `/?webcamPublisher=1`
- Stream ID: `raw.local.webcam`
- Default WHIP URL: `https://localhost/webrtc/raw/local/webcam/whip`
- Playback API: `/api/v1/streams/raw.local.webcam/playback`

## 로컬 절차

1. MediaMTX를 실행한다.
2. dashboard를 실행한다.
3. `/?webcamPublisher=1`로 이동한다.
4. `Start preview`를 눌러 브라우저 카메라 권한을 허용한다.
5. `Publish WebRTC`를 눌러 WHIP publish를 시도한다.
6. dashboard smoke 또는 stream player에서 `raw.local.webcam` playback 경로를 확인한다.

## 실패 처리 기준

| 실패 | 기대 UI |
| --- | --- |
| 카메라 API 없음 | `unsupported`와 지원 불가 메시지 |
| 권한 거부 | `error`와 브라우저 오류 메시지 |
| preview 전 publish | `Start camera preview before publishing.` |
| WHIP 실패 | `WHIP publish failed with <status>` |
| playback 실패 | RealtimePlayer의 reconnect/fallback/error 상태 |

## 제한사항

- 이 페이지는 M2 개발/검증용 하네스이며 현장 카메라 대체 기능이 아니다.
- HTTPS가 아닌 환경에서는 브라우저가 카메라 권한을 제한할 수 있다. localhost는 예외로 허용된다.
- 실제 외부 접속 검증은 HTTPS/WSS와 ICE 설정 이후 Server-02 staging에서 다시 확인한다.
