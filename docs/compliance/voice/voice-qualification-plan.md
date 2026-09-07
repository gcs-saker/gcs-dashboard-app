# Operational voice qualification plan

## Objective

Demonstrate authorized Talkback routing and intelligibility for the selected MIL-STD-1472H
voice provisions without treating transport connectivity as speech qualification.

## Locked software profile

- Browser capture requests 48 kHz mono with echo cancellation, noise suppression, and AGC.
- Reported browser settings are checked; a reported mismatch fails Talkback startup.
- SDP selects Opus, 20 ms packet time, mono, in-band FEC enabled, DTX disabled, and a 32 kbit/s maximum average bitrate.
- The server authorizes every target and binds Talkback to the current stream and group scope.

## Test matrix

Test direct ICE, STUN-derived direct ICE, and TURN relay under 0, 1, 3, and 5 percent packet
loss; 20, 50, and 100 ms jitter; and 50, 150, 300, and 600 ms RTT. Record selected ICE path,
actual capture settings, SDP, first-audio latency, one-way voice latency, jitter, loss, dropout,
clipping, reconnects, and unauthorized routing attempts.

## Intelligibility

Use designated Korean speech material and a controlled talker/listener panel. Record microphone,
headset, distance, orientation, noise level, talker/listener identifiers, training, repetitions,
MRT score, STI where available, and confidence intervals. Synthetic tones and decoded-frame
arrival cannot substitute for MRT/STI.

## Verdict

The qualification verdict remains BLOCKED until representative microphone, headset, noise
environment, calibrated measurement chain, and listener panel results exist. Software policy tests
may pass independently but cannot change the overall MIL-STD-1472H voice verdict to PASS.

