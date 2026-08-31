package kr.co.a4ai.gcssaker.authpolicy.api

object DeviceBootstrapApiFields {
    const val PROVISIONING_TOKEN = "provisioningToken"
    const val DEVICE_UUID = "deviceUuid"
    const val DEVICE_TYPE = "deviceType"
    const val CREDENTIAL = "credential"
    const val DISPLAY_NAME = "displayName"
    const val STATUS = "status"
    const val SENSORS = "sensors"
    const val STREAM_PATHS = "streamPaths"
}

object DeviceBootstrapApiErrors {
    const val INVALID_BOOTSTRAP_REQUEST = "invalid device bootstrap request"
}
