from sqlalchemy import BigInteger, Column, Integer, String, ForeignKey
from core.db import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    company_id = Column(BigInteger, ForeignKey("company.id"), nullable=False)
    role = Column(String(20), default="viewer")  # ex: admin/operator/viewer
