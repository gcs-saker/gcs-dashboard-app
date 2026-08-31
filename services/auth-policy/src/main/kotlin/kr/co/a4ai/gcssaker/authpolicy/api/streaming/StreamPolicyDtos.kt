package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.annotation.JsonProperty
import java.time.Instant

data class StreamAccessRequest(
    @get:JsonProperty(StreamPolicyApiFields.STREAM_ID)
    val streamId: String,
    val path: String,
    @get:JsonProperty(StreamPolicyApiFields.PUBLISHER_GROUP_ID)
    val publisherGroupId: String,
    val action: String = "view_stream",
    val startedAt: Instant? = null,
)

data class StreamAccessResponse(
    @get:JsonProperty(StreamPolicyApiFields.STREAM_ID)
    val streamId: String,
    val allowed: Boolean,
    val reason: String,
    @get:JsonProperty(StreamPolicyApiFields.PRINCIPAL_ID)
    val principalId: String,
    val username: String,
    val role: String,
    @get:JsonProperty(StreamPolicyApiFields.GROUP_ID)
    val groupId: String,
    @get:JsonProperty(StreamPolicyApiFields.EXPIRES_AT)
    val expiresAt: Instant,
    @get:JsonProperty(StreamPolicyApiFields.POLICY_VERSION)
    val policyVersion: String,
    @get:JsonProperty(StreamPolicyApiFields.PRINCIPAL_VERSION)
    val principalVersion: String,
    @get:JsonProperty(StreamPolicyApiFields.PERMISSIONS)
    val permissions: List<String> = emptyList(),
)
