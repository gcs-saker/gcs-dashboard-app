# Dashboard code agreement

The repository root agreement applies in full. These rules specialize it for React and TypeScript under `gcs-dashboard/`.

## Component boundaries

- Components render state and connect user events. API access, polling, cache synchronization, media lifecycle, and non-trivial state transitions belong in a service or custom hook.
- Components never derive authorization policy, group reachability, credentials, or private media routes.
- Prefer components below 150 lines and custom hooks below 120 lines. Split by behavior and ownership before either reaches the repository 350-line hard limit.
- Prefer at most eight props and five independent local state values. Exceeding either is a design-review trigger, not a reason to hide unrelated values in an untyped bag.
- Domain transformations live outside JSX and have direct unit tests.

## React lifecycle

- Use `useEffect` only to synchronize with an external system. Do not copy renderable derived state through an effect and `setState`.
- Every effect that creates a timer, listener, observer, request, media stream, peer connection, or subscription cleans it up.
- Async work supports cancellation or a current-request guard so stale responses cannot overwrite newer state.
- Polling permits one in-flight request, pauses while the document is hidden, cleans up on unmount, and uses bounded backoff after failures.
- Hook dependency warnings are errors. A suppression requires a reason and a lifecycle regression test.
- Server state belongs in React Query, cross-view user state in the approved Zustand store, and ephemeral interaction state in the closest component.

## Types and presentation

- `any`, double assertions, and unnecessary non-null assertions are prohibited in production code. Validate `unknown` at the boundary.
- Do not use array indices as keys for reorderable or server-owned data.
- Boolean props describe state, not alternate component responsibilities. Use variants or separate components when behavior diverges.
- User-visible states cover loading, empty, success, degraded, unauthorized, and failure without exposing internal endpoints or raw server errors.
- Interactive UI has an accessible name, keyboard operation, visible focus, and narrow-screen verification.
- Media UI stops retry loops and removes diagnostic-only chrome when a stream is no longer receivable.

## Verification

- Changed hooks include cleanup, stale-response, and rerender-loop tests where applicable.
- Stream or telemetry changes test active, disconnect, reconnect, absent data, authorization denial, and malformed payload paths.
- Run Oxlint React rules, TypeScript type checking, Vitest coverage, production build, and browser smoke tests before release.
