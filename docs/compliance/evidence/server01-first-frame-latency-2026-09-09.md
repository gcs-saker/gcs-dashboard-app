# Server-01 first-frame latency evidence — 2026-09-09

## Scope

- Runtime: Server-01 production through `https://gcs-saker.com`
- Smoke source revision: `f07b2ef7bef3843b2f220d81b7d26130066c3e47`
- Transport: authenticated account publish session, synthetic audio/video, TURN UDP relay-only
- Privacy: stream identifiers, session identifiers, credentials, tokens, and private media paths are omitted

## Result

| Phase | Result | Measured |
| --- | --- | ---: |
| WHIP local offer ready | PASS | 15.6 ms |
| WHIP answer | PASS | 74.1 ms |
| Publisher ICE connected | PASS | 141.6 ms |
| WHEP local offer ready | PASS | 14.5 ms |
| WHEP signaling round trip | PASS | 70.1 ms |
| Receiver ICE connected | PASS | 146.8 ms |
| ICE to first video frame | PASS | 427.7 ms |
| Receiver first video frame | PASS | 574.5 ms |
| Receiver first audio frame | PASS | 447.7 ms |
| Audio/video start offset | PASS | 126.8 ms |
| Selected-stream audio with talkback budget | PASS | 260.2 ms |
| Requested synthetic keyframe interval | PASS | 1,000.0 ms |
| Decoded-frame keyframe interval metadata | BLOCKED | Not observable within 20,000 ms |

The playback result is below the 1,000 ms warning threshold. The selected-stream audio result is
below the 500 ms talkback warning threshold. Both publisher and receivers selected a TURN relay
candidate and reached ICE `completed`.

## Diagnostic comparison

An initial STUN-only diagnostic waited about 5 seconds for gathering and produced a 7.23 second
end-to-end first frame. A relay-only run without a bounded synthetic GOP varied up to 2.39 seconds,
with 2.24 seconds after ICE connection. Setting the synthetic publisher request interval to one
second reduced the repeat run to 574.5 ms. This identifies source keyframe cadence, rather than
HTTP signaling or TURN connection, as the dominant variable.

PyAV's decoded `VideoFrame` did not preserve a usable keyframe flag on this path. The smoke records
that limitation as a bounded observation instead of hanging or reporting a fabricated exact value.
The source-side requested GOP interval remains explicit and test-covered.

## Reproduction and cleanup

The run used the repository WHIP publisher and WHEP receiver with latency budget enforcement,
keyframe observation, decoded video/audio requirements, and relay path enforcement. The temporary
account publish session was ended after each run. No production container or stateful service was
recreated.
