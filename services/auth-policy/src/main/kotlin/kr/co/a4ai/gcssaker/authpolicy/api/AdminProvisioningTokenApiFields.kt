package kr.co.a4ai.gcssaker.authpolicy.api

object AdminProvisioningTokenApiFields {
    const val TOKEN_ID = "tokenId"
    const val TOKEN = "token"
    const val GROUP_ID = "groupId"
    const val LABEL = "label"
    const val STATUS = "status"
    const val MAX_USES = "maxUses"
    const val USED_COUNT = "usedCount"
    const val TTL_MINUTES = "ttlMinutes"
    const val EXPIRES_AT = "expiresAt"
    const val CREATED_BY = "createdBy"
    const val CREATED_AT = "createdAt"
}

object AdminProvisioningTokenApiErrors {
    const val INVALID_PROVISIONING_TOKEN_REQUEST = "invalid provisioning token request"
    const val ADMIN_ROLE_REQUIRED = "admin role required"
}
