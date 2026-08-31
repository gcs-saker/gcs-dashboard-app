package kr.co.a4ai.gcssaker.authpolicy.domain

/** Stable domain errors translated by transport adapters without parsing messages. */
sealed class PolicyContractError(
    val code: String,
    message: String,
) : IllegalArgumentException(message)

class PermissionDeniedError(
    code: String,
    message: String,
) : PolicyContractError(code, message)

class ResourceNotFoundError(
    code: String,
    message: String,
) : PolicyContractError(code, message)

class StateConflictError(
    code: String,
    message: String,
) : PolicyContractError(code, message)

class InvalidContractError(
    code: String,
    message: String,
) : PolicyContractError(code, message)

object PolicyErrorCodes {
    const val GROUP_MANAGEMENT_SCOPE_REQUIRED = "group_management_scope_required"
    const val SYSTEM_ADMINISTRATOR_REQUIRED = "system_administrator_required"
    const val GROUP_ADMINISTRATOR_ROLE_REQUIRED = "group_administrator_role_required"
    const val MEMBER_NOT_FOUND = "group_member_not_found"
    const val ADMINISTRATOR_REPLACEMENT_REQUIRED = "administrator_replacement_required"
    const val MEMBER_ROLE_INVALID = "group_member_role_invalid"
    const val PASSWORD_TOO_SHORT = "password_too_short"
}
