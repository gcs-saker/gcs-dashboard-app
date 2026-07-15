package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.annotation.JsonProperty

data class RegisterDeviceRequest(
    @get:JsonProperty(AdminDeviceApiFields.GROUP_ID)
    val groupId: String,
    @get:JsonProperty(AdminDeviceApiFields.DISPLAY_NAME)
    val displayName: String,
    @get:JsonProperty(AdminDeviceApiFields.DEVICE_TYPE)
    val deviceType: String? = null,
    @get:JsonProperty(AdminDeviceApiFields.SENSORS)
    val sensors: List<DeviceSensorRequest> = emptyList(),
    @get:JsonProperty(AdminDeviceApiFields.STREAM_PATHS)
    val streamPaths: List<DeviceStreamRequest> = emptyList(),
)

data class UpdateDeviceRequest(
    @get:JsonProperty(AdminDeviceApiFields.GROUP_ID)
    val groupId: String? = null,
    @get:JsonProperty(AdminDeviceApiFields.DISPLAY_NAME)
    val displayName: String? = null,
    @get:JsonProperty(AdminDeviceApiFields.STATUS)
    val status: String? = null,
    @get:JsonProperty(AdminDeviceApiFields.DEVICE_TYPE)
    val deviceType: String? = null,
    @get:JsonProperty(AdminDeviceApiFields.SENSORS)
    val sensors: List<DeviceSensorRequest>? = null,
    @get:JsonProperty(AdminDeviceApiFields.STREAM_PATHS)
    val streamPaths: List<DeviceStreamRequest>? = null,
)

data class DeviceSensorRequest(
    @get:JsonProperty(AdminDeviceApiFields.SENSOR_ID)
    val sensorId: String,
    @get:JsonProperty(AdminDeviceApiFields.SENSOR_TYPE)
    val sensorType: String,
    @get:JsonProperty(AdminDeviceApiFields.STATUS)
    val status: String? = null,
)

data class DeviceStreamRequest(
    @get:JsonProperty(AdminDeviceApiFields.STREAM_PATH)
    val streamPath: String,
    @get:JsonProperty(AdminDeviceApiFields.KIND)
    val kind: String? = null,
    @get:JsonProperty(AdminDeviceApiFields.STATUS)
    val status: String? = null,
)

data class DeviceSensorResponse(
    @get:JsonProperty(AdminDeviceApiFields.SENSOR_ID)
    val sensorId: String,
    @get:JsonProperty(AdminDeviceApiFields.SENSOR_TYPE)
    val sensorType: String,
    @get:JsonProperty(AdminDeviceApiFields.STATUS)
    val status: String,
)

data class DeviceStreamResponse(
    @get:JsonProperty(AdminDeviceApiFields.STREAM_PATH)
    val streamPath: String,
    @get:JsonProperty(AdminDeviceApiFields.KIND)
    val kind: String,
    @get:JsonProperty(AdminDeviceApiFields.STATUS)
    val status: String,
)

data class RegisteredDeviceResponse(
    @get:JsonProperty(AdminDeviceApiFields.DEVICE_UUID)
    val deviceUuid: String,
    @get:JsonProperty(AdminDeviceApiFields.DEVICE_TYPE)
    val deviceType: String,
    @get:JsonProperty(AdminDeviceApiFields.GROUP_ID)
    val groupId: String,
    @get:JsonProperty(AdminDeviceApiFields.DISPLAY_NAME)
    val displayName: String,
    @get:JsonProperty(AdminDeviceApiFields.STATUS)
    val status: String,
    @get:JsonProperty(AdminDeviceApiFields.SENSORS)
    val sensors: List<DeviceSensorResponse>,
    @get:JsonProperty(AdminDeviceApiFields.STREAM_PATHS)
    val streamPaths: List<DeviceStreamResponse>,
)

data class DeviceCredentialIssueResponse(
    @get:JsonProperty(AdminDeviceApiFields.DEVICE_UUID)
    val deviceUuid: String,
    @get:JsonProperty(AdminDeviceApiFields.DEVICE_TYPE)
    val deviceType: String,
    @get:JsonProperty(AdminDeviceApiFields.CREDENTIAL)
    val credential: String,
    @get:JsonProperty(AdminDeviceApiFields.GROUP_ID)
    val groupId: String,
    @get:JsonProperty(AdminDeviceApiFields.DISPLAY_NAME)
    val displayName: String,
    @get:JsonProperty(AdminDeviceApiFields.STATUS)
    val status: String,
    @get:JsonProperty(AdminDeviceApiFields.SENSORS)
    val sensors: List<DeviceSensorResponse>,
    @get:JsonProperty(AdminDeviceApiFields.STREAM_PATHS)
    val streamPaths: List<DeviceStreamResponse>,
)
