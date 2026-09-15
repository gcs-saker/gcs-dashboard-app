# Mission and waypoint safety contract

Mission editing and mission dispatch are separate operations. Saving a draft cannot publish a device
command. Dispatch requires an explicit operator confirmation, current asset UUID and session ID,
positive server-side group authorization, current geofence validation, ordered bounded waypoints,
altitude datum, mission revision, immutable geofence version, unique command ID, issue time, and expiry.

Command lifetime is bounded to five minutes. The owned Redis ledger reserves a SHA-256-derived,
versioned key atomically with a TTL ending at command expiry; Redis failure and expired reservation
fail closed without exposing the command identifier in the key. The adapter is not enabled on a
public route until the complete mission dispatch boundary and recovery qualification are approved.

The browser never supplies a receiver, MQTT topic, or authoritative group. Media-control resolves the
active session and server-owned group, then an owned adapter may derive the private command route.
The dispatch domain reserves the command ID before publication; duplicate or ambiguous reservation
fails closed. A future persistence adapter must implement the reservation atomically with bounded TTL.

The existing operational geofence is an approved allowed area, not an exclusion-zone object. Mission
validation therefore requires the current group-owned allowed-area snapshot and checks the complete
ordered route. Every waypoint and every interval created by a segment's polygon-boundary intersections
must remain inside or on that area, including for concave polygons. Invalid, self-intersecting, degenerate,
or antimeridian-ambiguous geometry fails closed. The requested immutable version must exactly match the
provider's current version; a provider failure, group mismatch, or stale version cannot fall back to cached
browser geometry. The production auth-policy transport is still required before runtime enablement.

Altitude volume validation remains separate from horizontal geometry. AGL and MSL are never inferred from
a number, and dispatch cannot be enabled until the authoritative terrain or geoid conversion is qualified.
The UI must show asset, group-visible designation, session freshness, waypoint count, total distance,
altitude datum, and expiry in a final confirmation surface. Dispatch, denial, cancellation, and device
acknowledgement are auditable events.

