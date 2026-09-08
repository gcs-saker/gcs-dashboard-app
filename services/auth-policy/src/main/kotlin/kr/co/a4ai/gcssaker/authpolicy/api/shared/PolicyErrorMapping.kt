package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.InvalidContractError
import kr.co.a4ai.gcssaker.authpolicy.domain.PermissionDeniedError
import kr.co.a4ai.gcssaker.authpolicy.domain.PolicyContractError
import kr.co.a4ai.gcssaker.authpolicy.domain.ResourceNotFoundError
import kr.co.a4ai.gcssaker.authpolicy.domain.StateConflictError

fun PolicyContractError.toApiError(): ApiError = when (this) {
    is PermissionDeniedError -> ForbiddenApiError(message ?: "permission denied", code)
    is ResourceNotFoundError -> NotFoundApiError(message ?: "resource not found", code)
    is StateConflictError -> ConflictApiError(message ?: "state conflict", code)
    is InvalidContractError -> BadRequestApiError(message ?: "invalid request", code)
}

inline fun <T> translatePolicyErrors(action: () -> T): T = try {
    action()
} catch (error: PolicyContractError) {
    throw error.toApiError()
}
