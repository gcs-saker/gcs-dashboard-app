package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.annotation.JsonProperty

data class DevicePublishAuthorizationRequest(
    @get:JsonProperty(DevicePolicyApiFields.DEVICE_UUID)
    val deviceUuid: String,
    @get:JsonProperty(DevicePolicyApiFields.CREDENTIAL)
    val credential: String,
    @get:JsonProperty(DevicePolicyApiFields.STREAM_ID)
    val streamId: String,
    @get:JsonProperty(DevicePolicyApiFields.PATH)
    val path: String,
)

data class DevicePublishAuthorizationResponse(
    @get:JsonProperty(DevicePolicyApiFields.DEVICE_UUID)
    val deviceUuid: String,
    @get:JsonProperty(DevicePolicyApiFields.STREAM_ID)
    val streamId: String,
    @get:JsonProperty(DevicePolicyApiFields.PATH)
    val path: String,
    @get:JsonProperty(DevicePolicyApiFields.PUBLISHER_GROUP_ID)
    val publisherGroupId: String,
    @get:JsonProperty(DevicePolicyApiFields.REASON)
    val reason: String,
    @get:JsonProperty(DevicePolicyApiFields.POLICY_VERSION)
    val policyVersion: String,
)
