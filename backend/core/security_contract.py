from __future__ import annotations

from typing import Literal

UserRole = Literal["viewer", "operator", "admin"]
TokenUse = Literal["access", "refresh"]

ROLE_VIEWER: UserRole = "viewer"
ROLE_OPERATOR: UserRole = "operator"
ROLE_ADMIN: UserRole = "admin"

ROLE_ORDER: dict[UserRole, int] = {
    ROLE_VIEWER: 1,
    ROLE_OPERATOR: 2,
    ROLE_ADMIN: 3,
}

TOKEN_TYPE_ACCESS: TokenUse = "access"
TOKEN_TYPE_REFRESH: TokenUse = "refresh"
JWT_CLAIM_SUBJECT = "sub"
JWT_CLAIM_ROLE = "role"
JWT_CLAIM_TOKEN_USE = "token_use"
JWT_CLAIM_ISSUED_AT = "iat"
JWT_CLAIM_EXPIRES_AT = "exp"
JWT_CLAIM_ISSUER = "iss"
BEARER_AUTH_HEADER = {"WWW-Authenticate": "Bearer"}
AUTHENTICATION_REQUIRED_DETAIL = "authentication required"
BEARER_TOKEN_REQUIRED_DETAIL = "bearer token required"
INVALID_TOKEN_DETAIL = "invalid token"
TOKEN_EXPIRED_DETAIL = "token expired"
ROLE_REQUIRED_DETAIL_TEMPLATE = "{role} role required"
