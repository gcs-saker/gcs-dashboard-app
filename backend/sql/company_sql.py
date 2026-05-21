# models/company.py
from sqlalchemy import Column, BigInteger, String
from sqlalchemy.sql import func
from core.db import Base


class Company(Base):
    __tablename__ = "company"

    id = Column(BigInteger, primary_key=True, index=True)
    companyname = Column(String(100), nullable=False)
    invite_code = Column(String(6), nullable=False, unique=True)