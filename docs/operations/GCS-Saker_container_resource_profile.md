# GCS-Saker container resource profile

The single-node Compose file owns explicit CPU, memory, PID, file-descriptor, and graceful-stop bounds. These values are safety ceilings, not capacity claims; production sizing still requires load and soak evidence on Server-01 hardware.

| Profile | Services | `nofile` soft/hard | Stop grace | Rationale |
| --- | --- | ---: | ---: | --- |
| Stateful | PostgreSQL | 16384/32768 | 60s | Allow checkpoint and clean database shutdown before forced termination. |
| Stateful cache/broker | Redis, MQTT | 16384/32768 | 30s | Allow AOF or broker persistence flush while bounding descriptor growth. |
| Application | backend, media-control | 16384/32768 | 30s | Bound HTTP/gRPC/database pools and allow in-flight request cleanup. |
| JVM policy | auth-policy | 16384/32768 | 45s | Match Spring graceful shutdown and leave time for audit writes. |
| High connection | MediaMTX | 32768/65536 | 30s | Accommodate signaling and media sockets without an unbounded host limit. |
| Relay | TURN primary/secondary | 32768/65536 | 20s | Bound relay descriptors while avoiding long deployment stalls. |
| Presentation | dashboard | 16384/32768 | 15s | Static nginx worker shutdown. |
| Public edge | edge | 32768/65536 | 15s | Bound ingress connections and drain short HTTP requests. |

Image-owned stop signals remain authoritative. Compose sets only the grace interval, so PostgreSQL keeps its image `SIGINT` behavior and nginx keeps its image-specific graceful signal.

The pinned Coturn image marks `turnserver` with `NET_BIND_SERVICE` as a file capability. Docker refuses to execute that binary when the capability is absent from the container bounding set, even when configured ports are above 1024. TURN therefore drops every capability and adds back only `NET_BIND_SERVICE`; runtime regression tests lock this documented image-specific exception.

The externally supplied mobile publisher image is intentionally excluded from this change. Its current PID, CPU, and memory limits remain unchanged; file-descriptor and stop-signal changes require the mobile artifact owner's separate compatibility validation.

Any increase must include a measured concurrency target, peak descriptor evidence, memory/CPU impact, and a rollback value. A limit hit is a capacity failure to investigate, not a reason to remove the bound.
