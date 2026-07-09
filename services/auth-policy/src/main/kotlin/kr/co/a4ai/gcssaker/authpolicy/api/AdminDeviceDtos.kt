package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.annotation.JsonProperty

data class RegisterDeviceRequest(
    @get:JsonProperty(AdminDeviceApiFields.GROUP_ID)
    val groupId: String,
    @get:JsonProperty(AdminDeviceApiFields.DISPLAY_NAME)
    val displayName: String,
)

data class RegisteredDeviceResponse(
    @get:JsonProperty(AdminDeviceApiFields.DEVICE_UUID)
    val deviceUuid: String,
    @get:JsonProperty(AdminDeviceApiFields.GROUP_ID)
    val groupId: String,
    @get:JsonProperty(AdminDeviceApiFields.DISPLAY_NAME)
    val displayName: String,
    @get:JsonProperty(AdminDeviceApiFields.STATUS)
    val status: String,
)

data class DeviceCredentialIssueResponse(
    @get:JsonProperty(AdminDeviceApiFields.DEVICE_UUID)
    val deviceUuid: String,
    @get:JsonProperty(AdminDeviceApiFields.CREDENTIAL)
    val credential: String,
    @get:JsonProperty(AdminDeviceApiFields.GROUP_ID)
    val groupId: String,
    @get:JsonProperty(AdminDeviceApiFields.DISPLAY_NAME)
    val displayName: String,
    @get:JsonProperty(AdminDeviceApiFields.STATUS)
    val status: String,
)
