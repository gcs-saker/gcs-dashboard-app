# Dashboard Feature Structure

## Folders
- `components/`: reusable dashboard panels, dialogs, and widget controls.
- `hooks/`: dashboard state orchestration hooks. Keep polling, selection, and layout state out of `DashboardMvp.tsx`.
- `map/`: map rendering adapters and GPS-focused map UI.

## Boundaries
- `DashboardMvp.tsx` composes the page and owns only top-level user actions.
- Stream registry shaping belongs in `streamDevices.ts`.
- Asset hierarchy shaping belongs in `assetTree.ts`.
- Server health shaping belongs in `serverStatus.ts`.

## M2 Rule
Every new dashboard behavior should either live in a small component or a typed hook. Avoid adding more long-lived state directly to `DashboardMvp.tsx`.
