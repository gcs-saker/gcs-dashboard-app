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
    magneticX = Column(Float)
    magneticY = Column(Float)
    magneticZ = Column(Float)

    # 배터리/속도
    soc = Column(Float)
    phoneBatterySOC = Column(Float)
    velocity = Column(Float)

    # 거리/시간
    totalDistance = Column(Float)
    epochTime = Column(Float)  # DB에 INT(11)이므로 float/int로 받아야 안전
    portDistance = Column(Float)
