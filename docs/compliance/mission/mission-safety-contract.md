# Mission and waypoint safety contract

Mission editing and mission dispatch are separate operations. Saving a draft cannot publish a device
command. Dispatch requires an explicit operator confirmation, current asset UUID and session ID,
positive server-side group authorization, current geofence validation, ordered bounded waypoints,
altitude datum, revision, unique command ID, issue time, and expiry.

The browser never supplies a receiver, MQTT topic, or authoritative group. Media-control resolves the
active session and server-owned group, then an owned adapter may derive the private command route.
The dispatch domain reserves the command ID before publication; duplicate or ambiguous reservation
fails closed. A future persistence adapter must implement the reservation atomically with bounded TTL.

Geofence validation receives the complete ordered route and datum. Its implementation must check every
segment and altitude volume, not only waypoint vertices. AGL and MSL are never inferred from a number.
The UI must show asset, group-visible designation, session freshness, waypoint count, total distance,
altitude datum, and expiry in a final confirmation surface. Dispatch, denial, cancellation, and device
acknowledgement are auditable events.

