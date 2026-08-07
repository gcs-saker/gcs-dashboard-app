from sqlalchemy import Column, Float, String

from core.db import Base


class Telemetry(Base):
    __tablename__ = "telemetry_realtime"

    # PK
    uuid = Column(String(64), primary_key=True, index=True)

    # 좌표/센서
    latitude = Column(Float)
    longitude = Column(Float)
    altitude = Column(Float)
    magnetic_x = Column("magneticX", Float)
    magnetic_y = Column("magneticY", Float)
    magnetic_z = Column("magneticZ", Float)

    # 배터리/속도
    soc = Column(Float)
    phone_battery_soc = Column("phoneBatterySOC", Float)
    velocity = Column(Float)

    # 거리/시간
    total_distance = Column("totalDistance", Float)
    epoch_time = Column("epochTime", Float)
    port_distance = Column("portDistance", Float)
