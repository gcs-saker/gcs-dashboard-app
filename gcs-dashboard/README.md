# GCS-Saker Dashboard

React + TypeScript dashboard for GCS-Saker. The app is built with Vite, TanStack Query, Zustand, WebRTC/HLS playback components, IndexedDB-backed local UI preferences, and dashboard feature modules.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

`VITE_*` variables are build-time values. Keep real server secrets outside frontend env files because they are baked into the browser bundle.

Local Docker Compose uses the hardened Mosquitto profile by default. Before running the full local stack, generate `../deploy/mosquitto/passwords.local` and keep it out of Git:

```bash
docker run --rm -it -v "$PWD/../deploy/mosquitto:/work" eclipse-mosquitto:2 \
  mosquitto_passwd -c /work/passwords.local gcs_backend_pub
docker run --rm -it -v "$PWD/../deploy/mosquitto:/work" eclipse-mosquitto:2 \
  mosquitto_passwd /work/passwords.local gcs_device_gateway
```

The no-auth broker is available only through `docker-compose.mqtt-no-auth.profile.yml` with the `local-mqtt-no-auth` profile for isolated local smoke checks.

## Verification

```bash
npm run typecheck
npm run build
npm test -- --run
npm run test:coverage
```

Playwright E2E smoke uses the local Vite web server with MSW preview handlers. It verifies login routing, dashboard entry, stream selection, map marker selection, event log, and CCTV navigation without real credentials:

```bash
npm run test:e2e
```

Screenshots and failure context are written under `test-results/` and `playwright-report/`; both are local artifacts and are intentionally ignored by Git.

## Component Scenarios

Dashboard component scenarios use Ladle:

```bash
npm run stories
npm run stories:build
```

Ladle was selected over Storybook for the current M10 scope because the dashboard already uses Vite, and the immediate goal is lightweight state documentation rather than a full design-system addon stack. Stories focus on fixed UI states for streams, system status, event logs, map popups, and audio waveform panels. The story fixtures reuse MSW mock data where possible so API contract mocks and component scenarios do not drift apart.

## Render Diagnostics

Render diagnostics are opt-in and development-only:

```bash
VITE_RENDER_DIAGNOSTICS=1 npm run dev
```

The adopted baseline is React Profiler plus the local `useRenderDiagnostics` hook. React Profiler is already part of React, so it gives commit duration and render count evidence without adding a runtime dependency. React Scan and why-did-you-render remain deferred candidates: they are useful for visual overlays and memo diagnostics, but need additional React 19 and production-bundle isolation checks before adoption. Current hotspot baselines are stream grid status updates and audio waveform updates; the guard stores snapshots on `globalThis.__GCS_SAKER_RENDER_DIAGNOSTICS__` and profiler commits on `globalThis.__GCS_SAKER_RENDER_PROFILER_COMMITS__` only when the flag is enabled.

## Local Server-01 Dashboard Check

For local UI checks against Server-01 edge, the browser must call the Vite server path and let Vite proxy route traffic. The dashboard should not call `http://localhost:8001` directly.

Recommended local `.env` values:

```bash
VITE_API_BASE_URL=/api
VITE_AUTH_API_BASE_URL=/auth-policy/auth
VITE_STREAM_API_BASE_URL=/media-control
VITE_HLS_BASE_URL=/hls
VITE_LOCAL_WEBCAM_WHIP_URL=/webrtc/raw/local/webcam/whip
VITE_DEV_PROXY_TARGET=https://a4ai.121-159-26-245.sslip.io
```

If DevTools shows `http://localhost:8001/auth/login` or `/api/auth/login`, an old `.env` or shell-level `VITE_AUTH_API_BASE_URL` is still active.

## Feature Layout

```text
src/features/auth/          login/signup API and views
src/features/dashboard/     dashboard panels, map, events, status, preferences
src/features/streaming/     WebRTC, HLS, publisher, talkback
src/features/ui/            shared UI primitives
src/mocks/                  MSW handlers and fixtures
```

Build outputs such as `dist`, `coverage`, `test-results`, certificates, and local env files are intentionally ignored.
