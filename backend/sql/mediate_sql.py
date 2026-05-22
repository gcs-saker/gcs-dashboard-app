from typing import Any

from sqlalchemy import Column, BigInteger, String, Enum, ForeignKey
from core.db import Base
from sqlalchemy.orm import relationship

class Gateway(Base):
    __tablename__ = "gateway"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    cid = Column(String(64), nullable=False)
    uuid = Column(String(64), unique=True, nullable=False, index=True)
    company_id = Column(BigInteger, nullable=False)
    type: Any = Column(Enum("smartphone", "tablet", "smartwatch", "etc"), nullable=False)
    os: Any = Column(Enum("android", "iphone", "etc"), nullable=False)
    name = Column(String(100), nullable=True)
    status = Column(String(50), nullable=True)
    
    assets = relationship("GatewayAsset", back_populates="gateway")

class UnmannedAsset(Base):
    __tablename__ = "unmanned_assets"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    cid = Column(String(64), nullable=False)
    uuid = Column(String(64), unique=True, nullable=False, index=True)
    company_id = Column(BigInteger, nullable=False)
    type: Any = Column(Enum("drone", "rover", "ugv", "usv", "uav", "cctv", "etc"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(String(2000), nullable=True)
    image_url = Column(String(1000), nullable=True)
    status = Column(String(50), default="active")
    
    gateways = relationship("GatewayAsset", back_populates="asset")

class GatewayAsset(Base):
    __tablename__ = "gateway_assets"
    gateway_id = Column(BigInteger, ForeignKey("gateway.id"), primary_key=True)
    asset_id = Column(BigInteger, ForeignKey("unmanned_assets.id"), primary_key=True)

    gateway = relationship("Gateway", back_populates="assets")
    asset = relationship("UnmannedAsset", back_populates="gateways")
