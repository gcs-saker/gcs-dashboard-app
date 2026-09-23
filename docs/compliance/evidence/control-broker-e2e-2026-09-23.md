# Test-only Mosquitto control round trip — 2026-09-23

- Parent issue: `#790`
- Result: `PASS`
- Production integration: `NOT_RUN`

An isolated Mosquitto 2.0.22 container accepted a QoS 1 protobuf control command from a test server
client. A virtual-device client decoded the command, executed the fixed STOP handler, encoded the ACK,
and published it through the broker. The server client received and validated the ACK session and
status. The Go race detector was enabled.

The broker used no host port, persistence, production credential, production certificate, or
production volume. The script created a uniquely named labelled network and broker, installed an EXIT
cleanup trap, and left zero test-labelled containers and zero test-labelled networks after completion.
