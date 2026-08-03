from sqlalchemy import Column, DateTime, String, Text

from core.db import Base


class AIResultEvent(Base):
    __tablename__ = "ai_result_events"

    event_id = Column(String(160), primary_key=True)
    stream_id = Column(String(160), nullable=False, index=True)
    group_id = Column(String(64), nullable=False)
    processor_id = Column(String(128), nullable=False)
    schema_version = Column(String(64), nullable=False)
    payload_json = Column(Text, nullable=False)
    generated_at = Column(DateTime(timezone=True), nullable=False)
    stored_at = Column(DateTime(timezone=True), nullable=False)
