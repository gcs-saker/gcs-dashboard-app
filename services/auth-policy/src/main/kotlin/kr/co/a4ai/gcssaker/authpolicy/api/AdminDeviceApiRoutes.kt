package kr.co.a4ai.gcssaker.authpolicy.api

object AdminDeviceApiRoutes {
    const val ROOT = "/admin/devices"
    const val DEVICE = "/{deviceUuid}"
    const val ACTIVATE = "/{deviceUuid}/activate"
    const val DISABLE = "/{deviceUuid}/disable"
    const val ROTATE_CREDENTIAL = "/{deviceUuid}/credential"
}
