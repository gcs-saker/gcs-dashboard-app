from __future__ import annotations

from dataclasses import dataclass
from time import time
from uuid import uuid4

from model.telemetry_model import TelemetryCreate
from modules.protocol_v2.telemetry_contract import (
    AssetKinds,
    GeoPointFields,
    HealthStates,
)
from modules.protocol_v2.telemetry_geo import legacy_epoch_seconds
from modules.protocol_v2.telemetry_wire import decode_telemetry_envelope, encode_telemetry_envelope


@dataclass(frozen=True)
class TelemetryEnvelopePayload:
    event_id: str
    org_id: str
    group_id: str
    asset_id: str
    asset_kind: int
    observed_unix_millis: int
    received_unix_millis: int
    latitude: float
    longitude: float
    altitude_m: float
    heading_deg: float
    speed_mps: float
    battery_percent: float
    health: int
    active_stream_ids: tuple[str, ...] = ()

    @classmethod
    def create(
        cls,
        *,
        org_id: str,
        group_id: str,
        asset_id: str,
        latitude: float,
        longitude: float,
        altitude_m: float = 0,
        heading_deg: float = 0,
        speed_mps: float = 0,
        battery_percent: float = 0,
        asset_kind: int = AssetKinds.OPERATOR_DEVICE,
        health: int = HealthStates.OK,
        active_stream_ids: tuple[str, ...] = (),
        observed_unix_millis: int | None = None,
        received_unix_millis: int | None = None,
    ) -> "TelemetryEnvelopePayload":
        now = int(time() * 1000)
        return cls(
            event_id=str(uuid4()),
            org_id=org_id,
            group_id=group_id,
            asset_id=asset_id,
            asset_kind=asset_kind,
            observed_unix_millis=observed_unix_millis or now,
            received_unix_millis=received_unix_millis or now,
            latitude=latitude,
            longitude=longitude,
            altitude_m=altitude_m,
            heading_deg=heading_deg,
            speed_mps=speed_mps,
            battery_percent=battery_percent,
            health=health,
            active_stream_ids=active_stream_ids,
        )

    def to_protobuf_wire(self) -> bytes:
        return encode_telemetry_envelope(self)

    @classmethod
    def from_protobuf_wire(cls, payload: bytes) -> "TelemetryEnvelopePayload":
        decoded = decode_telemetry_envelope(payload)
        return cls(
            event_id=decoded.event_id,
            org_id=decoded.org_id,
            group_id=decoded.group_id,
            asset_id=decoded.asset_id,
            asset_kind=decoded.asset_kind,
            observed_unix_millis=decoded.observed_unix_millis,
            received_unix_millis=decoded.received_unix_millis,
            latitude=decoded.latitude,
            longitude=decoded.longitude,
            altitude_m=decoded.altitude_m,
            heading_deg=decoded.heading_deg,
            speed_mps=decoded.speed_mps,
            battery_percent=decoded.battery_percent,
            health=decoded.health,
            active_stream_ids=decoded.active_stream_ids,
        )

    def to_legacy_telemetry(self) -> TelemetryCreate:
        return TelemetryCreate(
            uuid=self.asset_id,
            latitude=self.latitude,
            longitude=self.longitude,
            altitude=self.altitude_m,
            magneticX=self.heading_deg,
            velocity=self.speed_mps,
            phoneBatterySOC=self.battery_percent,
            epochTime=legacy_epoch_seconds(self.observed_unix_millis),
        )
