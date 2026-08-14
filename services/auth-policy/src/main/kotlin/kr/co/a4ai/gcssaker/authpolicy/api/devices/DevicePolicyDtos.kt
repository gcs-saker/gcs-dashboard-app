package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.annotation.JsonProperty

data class DevicePublishAuthorizationRequest(
    @get:JsonProperty(DevicePolicyApiFields.DEVICE_UUID)
    val deviceUuid: String,
    @get:JsonProperty(DevicePolicyApiFields.CREDENTIAL)
    val credential: String,
    val sensorId: String = "",
)

data class DevicePublishAuthorizationResponse(
    @get:JsonProperty(DevicePolicyApiFields.DEVICE_UUID)
    val deviceUuid: String,
    @get:JsonProperty(DevicePolicyApiFields.STREAM_ID)
    val streamId: String,
    @get:JsonProperty(DevicePolicyApiFields.PATH)
    val path: String,
    val sensorId: String,
    @get:JsonProperty(DevicePolicyApiFields.PUBLISHER_GROUP_ID)
    val publisherGroupId: String,
    val credentialVersion: Long,
    val devicePolicyVersion: Long,
    @get:JsonProperty(DevicePolicyApiFields.REASON)
    val reason: String,
    @get:JsonProperty(DevicePolicyApiFields.POLICY_VERSION)
    val policyVersion: String,
)
