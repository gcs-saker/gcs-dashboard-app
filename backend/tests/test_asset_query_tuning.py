import asyncio
from collections.abc import Generator

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from api.unmaned_assets import get_asset
from core.db import Base
from sql.mediate_sql import Gateway, GatewayAsset, UnmannedAsset


@pytest.fixture
def asset_db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    db = testing_session_local()
    db.add(
        Gateway(
            id=1,
            cid="CID001",
            uuid="raw.local.webcam",
            company_id=1,
            type="smartphone",
            os="android",
            name="Field Phone",
            status="online",
        )
    )
    db.add(
        UnmannedAsset(
            id=10,
            cid="ASSET001",
            uuid="asset-drone-01",
            company_id=1,
            type="drone",
            name="DRN-01",
            status="active",
        )
    )
    db.add(GatewayAsset(gateway_id=1, asset_id=10))
    db.commit()
    yield db
    db.close()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


def test_asset_lookup_uses_gateway_lookup_then_join_query(asset_db_session: Session) -> None:
    select_statements: list[str] = []
    bind = asset_db_session.get_bind()

    def record_selects(conn, cursor, statement, parameters, context, executemany) -> None:
        if statement.lstrip().upper().startswith("SELECT"):
            select_statements.append(statement)

    event.listen(bind, "before_cursor_execute", record_selects)
    try:
        assets = asyncio.run(get_asset("raw.local.webcam", asset_db_session))
    finally:
        event.remove(bind, "before_cursor_execute", record_selects)

    assert [asset.uuid for asset in assets] == ["asset-drone-01"]
    assert len(select_statements) == 2
    assert "gateway.id" in select_statements[0]
    assert "gateway.cid" not in select_statements[0]
    assert "gateway.company_id" not in select_statements[0]
    assert "JOIN gateway_assets" in select_statements[1]
