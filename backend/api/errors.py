from typing import Final

from fastapi import HTTPException, status

UNPROCESSABLE_ENTITY_STATUS: Final = 422


class ApiHttpError(HTTPException):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(status_code=status_code, detail=detail)


class BadRequestApiError(ApiHttpError):
    def __init__(self, detail: str) -> None:
        super().__init__(status.HTTP_400_BAD_REQUEST, detail)


class UnauthorizedApiError(ApiHttpError):
    def __init__(self, detail: str) -> None:
        super().__init__(status.HTTP_401_UNAUTHORIZED, detail)


class ForbiddenApiError(ApiHttpError):
    def __init__(self, detail: str) -> None:
        super().__init__(status.HTTP_403_FORBIDDEN, detail)


class UnprocessableEntityApiError(ApiHttpError):
    def __init__(self, detail: str) -> None:
        super().__init__(UNPROCESSABLE_ENTITY_STATUS, detail)


class NotFoundApiError(ApiHttpError):
    def __init__(self, detail: str) -> None:
        super().__init__(status.HTTP_404_NOT_FOUND, detail)


class ServiceUnavailableApiError(ApiHttpError):
    def __init__(self, detail: str) -> None:
        super().__init__(status.HTTP_503_SERVICE_UNAVAILABLE, detail)
