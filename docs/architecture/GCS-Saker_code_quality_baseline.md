# GCS-Saker code quality baseline

Measured on 2026-08-19 by `scripts/gates/code_quality_baseline.py`.

## Enforced limits

| Metric | Strict limit | Baseline behavior |
| --- | ---: | --- |
| Production source file | 350 lines | Always enforced |
| New or changed function | 60 lines | Always enforced |
| New or changed function complexity | 10 | Always enforced |
| Existing function violations | No increase | Stored by function hash and enforced in CI |

The cross-language complexity value is a conservative control-flow estimate. Python uses its AST; Go, Kotlin, and TypeScript use deterministic brace and decision-token analysis. It is a regression gate rather than a replacement for language-native linters.

## Current inventory

| Language | Functions | Over 60 lines | Complexity over 10 |
| --- | ---: | ---: | ---: |
| Python | 461 | 0 | 1 |
| TypeScript/TSX | 670 | 37 | 13 |
| Kotlin | 451 | 4 | 0 |
| Go | 277 | 0 | 6 |
| **Total** | **1,859** | **41** | **20** |

Current maxima are 126 lines and complexity 16. The initial strict frontend Oxlint trial reported 25 findings. Production correctness findings were fixed and unavoidable hoisted Vitest factories received local documented suppressions; the strict profile now reports zero findings and runs in CI.

## Highest-priority hotspots

| Priority | Function | Reason |
| --- | --- | --- |
| P1 | `useLocalWebcamPublisherController` | 123 lines and complexity 13 around media resource ownership |
| P2 | `AuthRuntimeSettingsReader.fromEnvironment` | 126-line configuration mapper |
| P2 | Dashboard and streaming view functions | Most of the 39 TypeScript length violations are presentation decomposition work |

## Immediate contract result

The critical pattern scan initially found two cases:

1. A health boundary that intentionally converted dependency failure to an explicit error health result. The detector was narrowed so surfaced failure is not treated as hidden failure.
2. A nil Go HTTP client fallback without a timeout. The fallback now receives a bounded three-second timeout and a regression test.

After correction, the critical contract reports zero violations across 647 production files. Refactoring batches split gRPC telemetry validation, GPS send lifecycle, WebRTC diagnostics, hierarchical group policy, REST/telemetry payload schemas, and stream equality predicates. Together they reduced long functions from 43 to 41, complex functions from 29 to 20, and global maximum complexity from 27 to 16.

## Reduction policy

- New functions must satisfy strict limits immediately.
- Editing an existing function changes its content hash and requires that function to satisfy strict limits.
- Deleting or splitting an offender lowers the baseline automatically; the committed baseline is regenerated only in the same reviewed change.
- CI rejects increases in offender counts, maximum function length, or maximum complexity.
- P1 contract, authorization, concurrency, telemetry, and media-lifecycle hotspots are reduced before P2 presentation-only length findings.
