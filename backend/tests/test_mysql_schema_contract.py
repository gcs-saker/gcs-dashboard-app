from sqlalchemy import BigInteger

from sql.company_sql import Company
from sql.user_sql import User


def test_user_company_foreign_key_type_matches_company_primary_key() -> None:
    company_id_type = Company.__table__.c.id.type
    user_company_id_type = User.__table__.c.company_id.type

    assert isinstance(company_id_type, BigInteger)
    assert isinstance(user_company_id_type, BigInteger)
