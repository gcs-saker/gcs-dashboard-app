# Go module license remediation — 2026-09-17

## Scope

- Source baseline: `4005d0d03e5152cd420c97a4c6ad1c5ab7b13947`
- Input SBOM: `media-control.spdx.json` from signed release run `35182450271`
- Resolver: `go-licenses/v2 v2.0.1`
- Runtime: Go 1.26.6 in Docker

## Result

The 30 `pkg:golang` records previously reported as `UNKNOWN` now have exact versioned PURLs,
version-pinned upstream license URLs, reviewer identity, and verification date in
`docs/compliance/supply-chain/license-resolutions.yml`.

Docker replay changed the report from:

- `ALLOWED: 1`
- `FIRST_PARTY: 2`
- `UNKNOWN: 30`

to:

- `ALLOWED: 30`
- `FIRST_PARTY: 2`
- `REVIEW_REQUIRED: 1`
- `UNKNOWN: 0`

The remaining review record is `github.com/eclipse/paho.mqtt.golang v1.5.1` under `EPL-2.0`.
It was not silently added to the global allowlist. Internal service deployment remains allowed;
external distribution remains blocked until an authorized reviewer records the applicable notice
and source-code obligations.
