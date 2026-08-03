package kr.co.a4ai.gcssaker.authpolicy.api

import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException

sealed class ApiError(
    status: HttpStatus,
    reason: String,
) : ResponseStatusException(status, reason)

class BadRequestApiError(reason: String) : ApiError(HttpStatus.BAD_REQUEST, reason)

class UnauthorizedApiError(reason: String) : ApiError(HttpStatus.UNAUTHORIZED, reason)

class ForbiddenApiError(reason: String) : ApiError(HttpStatus.FORBIDDEN, reason)

class NotFoundApiError(reason: String) : ApiError(HttpStatus.NOT_FOUND, reason)

class ConflictApiError(reason: String) : ApiError(HttpStatus.CONFLICT, reason)
