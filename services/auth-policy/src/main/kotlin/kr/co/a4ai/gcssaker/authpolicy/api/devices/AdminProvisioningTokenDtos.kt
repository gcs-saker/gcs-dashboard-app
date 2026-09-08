package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.annotation.JsonProperty

data class IssueProvisioningTokenRequest(
    @get:JsonProperty(AdminProvisioningTokenApiFields.GROUP_ID)
    val groupId: String,
    @get:JsonProperty(AdminProvisioningTokenApiFields.LABEL)
    val label: String,
    @get:JsonProperty(AdminProvisioningTokenApiFields.TTL_MINUTES)
    val ttlMinutes: Long? = null,
    @get:JsonProperty(AdminProvisioningTokenApiFields.MAX_USES)
    val maxUses: Int? = null,
)

data class ProvisioningTokenIssueResponse(
    @get:JsonProperty(AdminProvisioningTokenApiFields.TOKEN_ID)
    val tokenId: String,
    @get:JsonProperty(AdminProvisioningTokenApiFields.TOKEN)
    val token: String,
    @get:JsonProperty(AdminProvisioningTokenApiFields.GROUP_ID)
    val groupId: String,
    @get:JsonProperty(AdminProvisioningTokenApiFields.LABEL)
    val label: String,
    @get:JsonProperty(AdminProvisioningTokenApiFields.STATUS)
    val status: String,
    @get:JsonProperty(AdminProvisioningTokenApiFields.MAX_USES)
    val maxUses: Int,
    @get:JsonProperty(AdminProvisioningTokenApiFields.USED_COUNT)
    val usedCount: Int,
    @get:JsonProperty(AdminProvisioningTokenApiFields.EXPIRES_AT)
    val expiresAt: String,
    @get:JsonProperty(AdminProvisioningTokenApiFields.CREATED_BY)
    val createdBy: String,
    @get:JsonProperty(AdminProvisioningTokenApiFields.CREATED_AT)
    val createdAt: String,
)

data class ProvisioningTokenRecordResponse(
    @get:JsonProperty(AdminProvisioningTokenApiFields.TOKEN_ID)
    val tokenId: String,
    @get:JsonProperty(AdminProvisioningTokenApiFields.GROUP_ID)
    val groupId: String,
    @get:JsonProperty(AdminProvisioningTokenApiFields.LABEL)
    val label: String,
    @get:JsonProperty(AdminProvisioningTokenApiFields.STATUS)
    val status: String,
    @get:JsonProperty(AdminProvisioningTokenApiFields.MAX_USES)
    val maxUses: Int,
    @get:JsonProperty(AdminProvisioningTokenApiFields.USED_COUNT)
    val usedCount: Int,
    @get:JsonProperty(AdminProvisioningTokenApiFields.EXPIRES_AT)
    val expiresAt: String,
    @get:JsonProperty(AdminProvisioningTokenApiFields.CREATED_BY)
    val createdBy: String,
    @get:JsonProperty(AdminProvisioningTokenApiFields.CREATED_AT)
    val createdAt: String,
)
