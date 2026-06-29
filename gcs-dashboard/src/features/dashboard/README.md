# Dashboard Feature Structure

## Folders
- `components/`: reusable dashboard panels, dialogs, and widget controls.
- `hooks/`: dashboard state orchestration hooks. Keep polling, selection, and layout state out of `DashboardPage.tsx`.
- `map/`: map rendering adapters and GPS-focused map UI.

## Boundaries
- `DashboardPage.tsx` composes the page and owns only top-level user actions.
- Stream registry shaping belongs in `streamDevices.ts`.
- Asset hierarchy shaping belongs in `assetTree.ts`.
- Server health shaping belongs in `serverStatus.ts`.
- Browser persistence belongs behind `browserPreferenceRepository.ts`.
- Stream/device aliases are dashboard preferences and persist in IndexedDB, not sessionStorage.

## M2 Rule
Every new dashboard behavior should either live in a small component or a typed hook. Avoid adding more long-lived state directly to `DashboardPage.tsx`.

## Browser Storage Responsibility
- Memory only: access token and current interaction state.
- HttpOnly cookie: refresh token.
- TanStack Query: API/server state only.
- Zustand: shared UI state such as selected stream, filters, panel open state, and map auto focus.
- IndexedDB: dashboard layout, widget visibility, stream/device alias, CCTV grid, motion mode, and map preference.
- sessionStorage: redirect-after-login and one-shot UI state that should disappear after the tab/session ends.
- Never store: password, refresh token, private key, server secret, or long-lived access token in browser-visible storage.
