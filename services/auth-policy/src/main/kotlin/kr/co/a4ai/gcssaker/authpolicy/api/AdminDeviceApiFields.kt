package kr.co.a4ai.gcssaker.authpolicy.api

object AdminDeviceApiFields {
    const val DEVICE_UUID = "deviceUuid"
    const val CREDENTIAL = "credential"
    const val DISPLAY_NAME = "displayName"
    const val GROUP_ID = "groupId"
    const val STATUS = "status"
}

object AdminDeviceApiErrors {
    const val ADMIN_ROLE_REQUIRED = "admin role required"
    const val DEVICE_NOT_FOUND = "device not found"
    const val INVALID_DEVICE_REQUEST = "invalid device request"
}
