ALTER TABLE telemetry_latest ADD COLUMN battery_percent DOUBLE PRECISION;
ALTER TABLE telemetry_latest ADD COLUMN heading_deg DOUBLE PRECISION;
ALTER TABLE telemetry_latest ADD COLUMN roll_deg DOUBLE PRECISION;
ALTER TABLE telemetry_latest ADD COLUMN pitch_deg DOUBLE PRECISION;
ALTER TABLE telemetry_latest ADD COLUMN yaw_deg DOUBLE PRECISION;
ALTER TABLE telemetry_latest ADD COLUMN link_quality_percent DOUBLE PRECISION;
ALTER TABLE telemetry_latest ADD COLUMN observed_at TIMESTAMP;

ALTER TABLE telemetry_history ADD COLUMN battery_percent DOUBLE PRECISION;
ALTER TABLE telemetry_history ADD COLUMN heading_deg DOUBLE PRECISION;
ALTER TABLE telemetry_history ADD COLUMN roll_deg DOUBLE PRECISION;
ALTER TABLE telemetry_history ADD COLUMN pitch_deg DOUBLE PRECISION;
ALTER TABLE telemetry_history ADD COLUMN yaw_deg DOUBLE PRECISION;
ALTER TABLE telemetry_history ADD COLUMN link_quality_percent DOUBLE PRECISION;
ALTER TABLE telemetry_history ADD COLUMN observed_at TIMESTAMP;
