package kr.co.a4ai.gcssaker.authpolicy.domain

data class RegisteredDeviceSensor(
    val sensorId: String,
    val sensorType: String,
    val status: String = DeviceRegistryDefaults.ACTIVE_STATUS,
) {
    init {
        require(sensorId.isNotBlank()) { DeviceRegistryErrors.SENSOR_ID_REQUIRED }
        require(sensorType.isNotBlank()) { DeviceRegistryErrors.SENSOR_TYPE_REQUIRED }
        require(status.isNotBlank()) { DeviceRegistryErrors.SENSOR_STATUS_REQUIRED }
    }
}

data class RegisteredDeviceStream(
    val streamPath: String,
    val kind: String = DeviceRegistryDefaults.WEBRTC_KIND,
    val status: String = DeviceRegistryDefaults.ACTIVE_STATUS,
) {
    init {
        require(streamPath.isNotBlank()) { DeviceRegistryErrors.STREAM_PATH_REQUIRED }
        require(kind.isNotBlank()) { DeviceRegistryErrors.STREAM_KIND_REQUIRED }
        require(status.isNotBlank()) { DeviceRegistryErrors.STREAM_STATUS_REQUIRED }
    }
}

data class RegisteredDeviceSensors(val values: List<RegisteredDeviceSensor>) {
    companion object {
        fun empty(): RegisteredDeviceSensors = RegisteredDeviceSensors(emptyList())
    }
}

data class RegisteredDeviceStreams(val values: List<RegisteredDeviceStream>) {
    companion object {
        fun empty(): RegisteredDeviceStreams = RegisteredDeviceStreams(emptyList())
    }
}

object DeviceRegistryDefaults {
    const val ACTIVE_STATUS = "active"
    const val WEBRTC_KIND = "webrtc"
}

object DeviceRegistryErrors {
    const val SENSOR_ID_REQUIRED = "sensor id must not be blank"
    const val SENSOR_TYPE_REQUIRED = "sensor type must not be blank"
    const val SENSOR_STATUS_REQUIRED = "sensor status must not be blank"
    const val STREAM_PATH_REQUIRED = "stream path must not be blank"
    const val STREAM_KIND_REQUIRED = "stream kind must not be blank"
    const val STREAM_STATUS_REQUIRED = "stream status must not be blank"
}
