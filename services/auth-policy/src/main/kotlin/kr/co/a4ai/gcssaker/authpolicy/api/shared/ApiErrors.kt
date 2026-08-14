package kr.co.a4ai.gcssaker.authpolicy.api

import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException

sealed class ApiError(
    status: HttpStatus,
    reason: String,
    val code: String = status.name.lowercase(),
) : ResponseStatusException(status, reason)

class BadRequestApiError(reason: String, code: String = "invalid_request") : ApiError(HttpStatus.BAD_REQUEST, reason, code)

class UnauthorizedApiError(reason: String, code: String = "authentication_required") : ApiError(HttpStatus.UNAUTHORIZED, reason, code)

class ForbiddenApiError(reason: String, code: String = "permission_denied") : ApiError(HttpStatus.FORBIDDEN, reason, code)

class NotFoundApiError(reason: String, code: String = "resource_not_found") : ApiError(HttpStatus.NOT_FOUND, reason, code)

class ConflictApiError(reason: String, code: String = "state_conflict") : ApiError(HttpStatus.CONFLICT, reason, code)
