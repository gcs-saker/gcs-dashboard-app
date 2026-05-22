# M1-16 AI Endpoint Contract

## 목적

M1-16은 외부 AI endpoint가 GCS와 통신할 때 사용할 최소 request/response/error schema를 고정한다. 실제 AI 모델 학습과 정확도 개선은 이 범위가 아니며, M4의 AI Adapter service와 dashboard overlay는 이 계약을 기반으로 확장한다.

## Schema Version

현재 schema version은 다음 값으로 고정한다.

```text
ai.detection.v1alpha1
```

모든 request, response, error payload는 `schemaVersion`을 포함해야 한다. 알 수 없는 schema version은 validation error로 처리한다.

## Timestamp 기준

모든 timestamp는 timezone-aware ISO 8601 값이어야 한다. UTC 사용을 권장한다.

- `frame.capturedAt`: 영상 frame이 캡처된 시각
- `generatedAt`: AI endpoint가 응답을 생성한 시각
- `frame.ptsMs`: stream 기준 presentation timestamp, millisecond 단위

timezone 없는 timestamp는 거부한다.

## Request Schema

```json
{
  "schemaVersion": "ai.detection.v1alpha1",
  "streamId": "raw.sample.front",
  "frame": {
    "streamId": "raw.sample.front",
    "frameId": "frame-0001",
    "capturedAt": "2026-05-22T08:00:00Z",
    "ptsMs": 1200
  },
  "imageUrl": "https://media.example.test/raw/sample/front/frame-0001.jpg"
}
```

규칙:

- `streamId`는 backend stream registry의 streamId와 일치해야 한다.
- `frame.streamId`는 top-level `streamId`와 같아야 한다.
- `imageUrl` 또는 `frameDataBase64` 중 하나는 반드시 있어야 한다.
- 정의되지 않은 field는 거부한다.

## Response Schema

```json
{
  "schemaVersion": "ai.detection.v1alpha1",
  "streamId": "raw.sample.front",
  "frame": {
    "streamId": "raw.sample.front",
    "frameId": "frame-0001",
    "capturedAt": "2026-05-22T08:00:00Z",
    "ptsMs": 1200
  },
  "generatedAt": "2026-05-22T08:00:01Z",
  "riskScore": 0.82,
  "reportText": "작업자 접근 위험 감지",
  "detections": [
    {
      "label": "person",
      "bbox": { "x": 0.1, "y": 0.2, "width": 0.3, "height": 0.4 },
      "confidence": 0.91,
      "riskScore": 0.82,
      "trackId": "trk-001"
    }
  ]
}
```

Dashboard 표시용 최소 field:

- `bbox`: normalized frame coordinate. `x`, `y`, `width`, `height`는 0~1 범위이며 box는 frame 밖으로 나가면 안 된다.
- `riskScore`: 0~1 범위의 위험도 점수
- `reportText`: dashboard와 event log에 표시할 요약 문장
- `label`, `confidence`, `trackId`: overlay와 추적 UI 확장을 위한 최소 detection field

## Error Schema

```json
{
  "schemaVersion": "ai.detection.v1alpha1",
  "streamId": "raw.sample.front",
  "frame": {
    "streamId": "raw.sample.front",
    "frameId": "frame-0001",
    "capturedAt": "2026-05-22T08:00:00Z",
    "ptsMs": 1200
  },
  "generatedAt": "2026-05-22T08:00:01Z",
  "error": {
    "code": "AI_TIMEOUT",
    "message": "AI endpoint timed out",
    "retryable": true
  }
}
```

## 구현 위치

- Code: `backend/modules/ai_contract/schemas.py`
- Tests: `backend/tests/test_ai_endpoint_contract.py`

이 계약은 Mock AI endpoint skeleton 이슈에서 route/service로 연결한다.
