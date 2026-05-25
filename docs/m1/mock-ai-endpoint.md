# M1-17 Mock AI Endpoint Skeleton

## 목적

M1-17은 실제 AI Adapter 구현 전에 dashboard/backend가 AI 결과 payload를 검증할 수 있도록 mock endpoint skeleton을 제공한다. 이 endpoint는 원본 stream playback 경로와 분리되어 있으며, 장애가 발생해도 `/api/v1/streams/*` API를 막지 않는다.

## Endpoint

```text
POST /api/v1/ai/mock/detections
```

Query options:

- `latencyMs`: mock latency simulation. 0~5000 ms.
- `simulateError`: `true`일 때 contract error schema를 503으로 반환한다.

## Request

Request body는 `docs/m1/ai-endpoint-contract.md`의 `AIEndpointRequest`를 따른다.

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

## 정상 응답

```json
{
  "schemaVersion": "ai.detection.v1alpha1",
  "streamId": "raw.sample.front",
  "generatedAt": "2026-05-22T08:00:01Z",
  "riskScore": 0.72,
  "reportText": "Mock AI detected a person near the sample stream.",
  "detections": [
    {
      "label": "person",
      "bbox": { "x": 0.18, "y": 0.22, "width": 0.24, "height": 0.34 },
      "confidence": 0.88,
      "riskScore": 0.72,
      "trackId": "mock-person-001"
    }
  ]
}
```

## 오류 응답

```bash
curl -X POST "http://127.0.0.1:8001/api/v1/ai/mock/detections?simulateError=true"
```

오류 응답도 `schemaVersion`, `generatedAt`, `error.code`, `error.message`, `error.retryable`을 포함한다.

## 검증 범위

- 정상 mock detection response
- latency simulation option
- error simulation option
- contract validation error
- AI endpoint 오류 후 streaming playback API 정상 동작

실제 AI Adapter service와 dashboard overlay는 M4에서 확장한다.
