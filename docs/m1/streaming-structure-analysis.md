# M1-01 Existing Saker Streaming Structure Analysis

## Scope

This document closes the research scope for M1-01:

- Identify the current `HLSPlayer` structure.
- Identify the current MediaMTX configuration.
- Summarize current stream API limitations.
- Decide which parts should be reused, wrapped, replaced, or retired during M1.
- Define the test/build gate that every M1 issue PR must satisfy.

## Current Frontend Streaming Flow

The dashboard currently renders live video through `gcs-dashboard/src/component/HLSPlayer.js`.

Current behavior:

- Uses `hls.js` when `Hls.isSupported()` is true.
- Falls back to native `application/vnd.apple.mpegurl` playback when browser support exists.
- Calls `video.play()` after manifest metadata is available.
- Emits basic video metadata through `onVideoInfo` when `LEVEL_SWITCHED` fires.
- Defaults to `http://www.saker.ai.kr:8888/stream/gcs/index.m3u8`.

Current call sites:

- `ControlMainBodyPanel` renders the selected stream as the main control view.
- `CCTVMainBodyPanel` renders a main stream plus telemetry-map thumbnails.
- `App.js` still contains an older layout path with `HLSPlayer` usage.

Observed limitations:

- Stream URLs are hardcoded in multiple components.
- The default stream path is embedded in `HLSPlayer`, so runtime stream discovery is not centralized.
- `HLSPlayer` handles playback, metadata extraction, fallback, and default URL policy in one component.
- Error/offline/loading states are not modeled as explicit UI states.
- `onVideoInfo` is assumed to exist at level switch time.
- `hls.on(...)` handlers are registered after the support branch, which means the native fallback path can leave `hls` undefined.
- There is no WebRTC/WHEP player yet.
- There is no wrapper that tries WebRTC first and falls back to HLS.
- No component-level tests currently pin playback state transitions.

## Current MediaMTX Configuration

The current MediaMTX configuration is `gcs-dashboard/mediamtx.yml`.

Current behavior:

```yaml
logLevel: info
rtmp: yes
hls: yes
paths:
  all:
    source: publisher
```

Docker exposure in `gcs-dashboard/docker-compose.yml`:

- `1935:1935` for RTMP ingest.
- `8888:8888` for HLS playback.

Nginx exposure in `gcs-dashboard/nginx.conf`:

- React app served on port `3000`.
- `/hls/` proxies to `http://mediamtx:8888/`.

Observed limitations:

- WebRTC/WHEP is not enabled.
- SRT and RTSP ingest are not exposed in the current compose file.
- MediaMTX API and metrics are not configured as private/internal-only endpoints.
- HLS proxy exists, but frontend components still use absolute external URLs instead of the proxy path.
- Stream path rules are implicit and duplicated across frontend code.

## Current Backend Stream API

The current backend route is `backend/api/stream.py`.

Current behavior:

```python
@router.get("/status")
async def stream_status():
    return {"stream": "ready"}
```

Observed limitations:

- No stream registry model exists yet.
- `backend/model/stream_model.py` is empty.
- There is no stream listing endpoint.
- There is no stream detail endpoint.
- There is no playback URL builder.
- There is no stream health/status model beyond the static `/stream/status` response.
- There is no API versioning for the future `/api/v1/streams` contract.
- There are no backend unit or integration tests around stream behavior.

## Reuse / Replace / Retire Decisions

Reuse:

- Keep the existing `HLSPlayer` as the HLS fallback implementation after extracting URL policy out of it.
- Keep MediaMTX as the media server.
- Keep the existing nginx `/hls/` proxy pattern for same-origin HLS fallback.
- Keep `videoInfo` metadata propagation, but make it defensive and state-based.

Wrap:

- Add `RealtimePlayer` as the dashboard-facing player wrapper.
- `RealtimePlayer` should call the backend playback API, attempt WebRTC first, and then fall back to HLS.
- `HLSPlayer` should become a focused fallback component.

Replace:

- Replace hardcoded `http://www.saker.ai.kr:8888/stream/...` usage with backend-provided playback URLs.
- Replace the static stream status route with stream registry and playback status endpoints.
- Replace implicit stream path conventions with the M1 path rule contract.

Retire:

- Retire default stream URLs inside presentational player components.
- Retire direct dashboard dependency on public MediaMTX URLs.
- Retire untested player state transitions before WebRTC rollout.

## Proposed M1 Target Architecture

Backend modules planned by later M1 issues:

- `modules/streaming/domain.py`
- `modules/streaming/schemas.py`
- `modules/streaming/service.py`
- `modules/streaming/repository.py`
- `modules/streaming/playback_url_builder.py`
- `modules/streaming/router.py`

API contract planned by later M1 issues:

- `GET /api/v1/streams`
- `GET /api/v1/streams/{streamId}`
- `GET /api/v1/streams/{streamId}/playback`
- `GET /api/v1/streams/{streamId}/status`

Player contract planned by later M1 issues:

- `WebRTCPlayer`: WHEP playback, connection state, loading/error/offline UI.
- `HLSFallbackPlayer`: focused HLS fallback with explicit fallback state.
- `RealtimePlayer`: playback API integration, WebRTC-first behavior, HLS fallback, status badge.

## Test And Build Gate For M1+

Starting with M1, an issue PR is not complete unless the relevant tests and builds are visible and passing.

Required baseline checks:

- Backend: `backend-test` must pass.
- Dashboard: `frontend-build` must pass.
- If frontend behavior changes, add or update Jest/React Testing Library tests.
- If backend behavior changes, add or update pytest unit tests and integration tests.
- If an issue introduces a public function, API route, schema, URL builder, or state transition, include focused tests for it.

Expected test layers:

- Backend unit tests: pure functions, schemas, URL builders, service decisions.
- Backend integration tests: FastAPI routes through `TestClient`, including success and error states.
- Dashboard unit tests: small rendering and state behavior with Jest and React Testing Library.
- Dashboard integration-style tests: player wrapper state transitions and API fallback behavior.
- Smoke tests: documented commands for docker compose, sample stream publishing, playback API, and dashboard rendering.

Coverage direction:

- M1 begins with focused coverage on newly introduced streaming code.
- Coverage should increase issue by issue, not be added as an afterthought.
- Any intentionally untested behavior must be called out in the PR body.

PR evidence expected from M1 onward:

- Commands or CI checks showing backend tests passed.
- Commands or CI checks showing dashboard tests/build passed.
- Screenshots or logs when the issue affects visible dashboard behavior.
- Clear `Closes #<issue>` linkage only after the acceptance criteria are satisfied.

## Immediate Risks For M1 Planning

- The current HLS-only flow is useful as a fallback but cannot satisfy low-latency WebRTC requirements alone.
- Hardcoded public stream URLs will make staging/production configuration brittle.
- The empty stream model and static stream API make frontend stream discovery impossible.
- WebRTC rollout should not modify the legacy HLS player directly before tests protect fallback behavior.
- CI must stay green before dashboard UI or backend API work is merged.

## Acceptance Mapping

- Existing HLSPlayer structure: documented.
- Existing MediaMTX settings: documented.
- Existing stream API limitations: documented.
- Reuse/discard decisions: documented.
- M1 test/build gate: documented for all subsequent issue PRs.
