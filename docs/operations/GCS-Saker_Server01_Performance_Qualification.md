# Server-01 performance and continuous-operation qualification

This procedure converts retained Server-01 measurements into controlled software-quality evidence.
It does not authorize production load and never targets Server-02.

## Entry conditions

1. The candidate is merged, CI is successful, and the deployed revision matches its source commit.
2. Quality assurance records the approved test window and immutable load-profile identifier.
3. The operator records the UTC time source and measured clock drift.
4. Public health, readiness, and unauthenticated denial pass before measurement.
5. A new owner-only evidence directory exists outside source control.

The non-mutating CI contract is:

```bash
python scripts/reports/performance_stability_qualification.py --check
```

## Collection

Use `scripts/benchmarks/m7_performance_benchmark_matrix.py` for control-plane request collection and
`scripts/smoke/m7_streaming_stability_soak.sh` for streaming continuity. Warm up with at least five
samples and retain at least 30 measured latency samples per metric. The final campaign target is 24
hours. Shorter engineering runs remain `FAIL` for the full-duration technical target and cannot be
presented as qualification.

Normalize the private raw result as `gcs-saker.performance-samples.v1`. It contains the exact source
commit, `server01-production`, `https://gcs-saker.com`, approval and load-profile IDs, clock evidence,
raw latency arrays, request errors, backpressure counts, queue-depth samples, disconnect/reconnect
counts, and CPU/memory samples. Credentials, cookies, tokens, usernames, private addresses, and raw
queries are prohibited.

## Produce immutable evidence

```bash
python scripts/reports/performance_stability_qualification.py \
  --input '<absolute-private-performance-samples.json>' \
  --output '<new-absolute-private-qualification-result.json>'
```

The report calculates p50, p95, and p99. It fails technically when the proposed p95 target is
exceeded, any request or backpressure error occurs, 24 hours are not observed, or a disconnect is
not recovered. A clean technical result remains `BLOCKED` until the load profile, thresholds, and
independent evaluator are approved. The output uses exclusive creation and never overwrites prior
evidence.

## Proposed engineering targets

| Measure | Proposed value |
| --- | ---: |
| Control-plane p95 | 500 ms |
| Telemetry acceptance p95 | 250 ms |
| Continuous operation | 24 h |
| Request errors | 0 |
| Backpressure events | 0 |
| Unrecovered disconnects | 0 |

These values guide engineering only and are not certified capacity or an approved acceptance claim.
