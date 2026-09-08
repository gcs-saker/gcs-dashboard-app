package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.annotation.JsonProperty

data class DeviceBootstrapRequest(
    @get:JsonProperty(DeviceBootstrapApiFields.PROVISIONING_TOKEN)
    val provisioningToken: String,
    @get:JsonProperty(DeviceBootstrapApiFields.DISPLAY_NAME)
    val displayName: String,
    @get:JsonProperty(DeviceBootstrapApiFields.DEVICE_TYPE)
    val deviceType: String? = null,
    @get:JsonProperty(DeviceBootstrapApiFields.SENSORS)
    val sensors: List<DeviceSensorRequest> = emptyList(),
    @get:JsonProperty(DeviceBootstrapApiFields.STREAM_PATHS)
    val streamPaths: List<DeviceStreamRequest> = emptyList(),
)

data class DeviceBootstrapResponse(
    @get:JsonProperty(DeviceBootstrapApiFields.DEVICE_UUID)
    val deviceUuid: String,
    @get:JsonProperty(DeviceBootstrapApiFields.DEVICE_TYPE)
    val deviceType: String,
    @get:JsonProperty(DeviceBootstrapApiFields.CREDENTIAL)
    val credential: String,
    @get:JsonProperty(DeviceBootstrapApiFields.DISPLAY_NAME)
    val displayName: String,
    @get:JsonProperty(DeviceBootstrapApiFields.STATUS)
    val status: String,
    @get:JsonProperty(DeviceBootstrapApiFields.SENSORS)
    val sensors: List<DeviceSensorResponse>,
    @get:JsonProperty(DeviceBootstrapApiFields.STREAM_PATHS)
    val streamPaths: List<DeviceStreamResponse>,
)
