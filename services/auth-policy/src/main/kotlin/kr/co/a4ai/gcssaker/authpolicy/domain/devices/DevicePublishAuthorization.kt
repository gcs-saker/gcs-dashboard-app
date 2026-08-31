package kr.co.a4ai.gcssaker.authpolicy.domain

data class DevicePublishAuthorizationCommand(
    val deviceUuid: String,
    val credential: String,
    val sensorId: String,
)

data class DevicePublishAuthorization(
    val deviceUuid: String,
    val streamId: String,
    val path: String,
    val sensorId: String,
    val publisherGroupId: GroupId,
    val credentialVersion: Long,
    val devicePolicyVersion: Long,
    val reason: String,
)

class DevicePublishAuthorizationRejectedException(message: String) : RuntimeException(message)

object DevicePublishAuthorizationReasons {
    const val DEVICE_GROUP_AUTHORIZED = "device group authorized"
    const val AUTHENTICATION_FAILED = "device authentication failed"
    const val DEVICE_INACTIVE = "device is not active"
    const val SENSOR_ID_REQUIRED = "sensor id is required when multiple sensors are active"
    const val SENSOR_NOT_AUTHORIZED = "sensor is not authorized for this device"
    const val STREAM_NOT_AUTHORIZED = "stream is not authorized for this device"
}
