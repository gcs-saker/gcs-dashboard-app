from dataclasses import dataclass
from typing import Protocol


class TelemetryWireSource(Protocol):
    @property
    def event_id(self) -> str: ...
    @property
    def org_id(self) -> str: ...
    @property
    def group_id(self) -> str: ...
    @property
    def asset_id(self) -> str: ...
    @property
    def asset_kind(self) -> int: ...
    @property
    def observed_unix_millis(self) -> int: ...
    @property
    def received_unix_millis(self) -> int: ...
    @property
    def latitude(self) -> float: ...
    @property
    def longitude(self) -> float: ...
    @property
    def altitude_m(self) -> float: ...
    @property
    def heading_deg(self) -> float: ...
    @property
    def speed_mps(self) -> float: ...
    @property
    def battery_percent(self) -> float: ...
    @property
    def health(self) -> int: ...
    @property
    def active_stream_ids(self) -> tuple[str, ...]: ...
    @property
    def roll_deg(self) -> float: ...
    @property
    def pitch_deg(self) -> float: ...
    @property
    def yaw_deg(self) -> float: ...
    @property
    def gyro_x_rad_per_sec(self) -> float: ...
    @property
    def gyro_y_rad_per_sec(self) -> float: ...
    @property
    def gyro_z_rad_per_sec(self) -> float: ...
    @property
    def accel_x_mps2(self) -> float: ...
    @property
    def accel_y_mps2(self) -> float: ...
    @property
    def accel_z_mps2(self) -> float: ...
    @property
    def link_quality_percent(self) -> float: ...


@dataclass(frozen=True)
class DecodedTelemetryEnvelope:
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
    active_stream_ids: tuple[str, ...]
    roll_deg: float
    pitch_deg: float
    yaw_deg: float
    gyro_x_rad_per_sec: float
    gyro_y_rad_per_sec: float
    gyro_z_rad_per_sec: float
    accel_x_mps2: float
    accel_y_mps2: float
    accel_z_mps2: float
    link_quality_percent: float
