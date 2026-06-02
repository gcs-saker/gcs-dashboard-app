package kr.co.a4ai.gcssaker.authpolicy.api

object OperationalReadApiFields {
    const val UUID = "uuid"
    const val LATITUDE = "latitude"
    const val LONGITUDE = "longitude"
    const val ALTITUDE = "altitude"
    const val MAGNETIC_X = "magneticX"
    const val MAGNETIC_Y = "magneticY"
    const val MAGNETIC_Z = "magneticZ"
    const val SOC = "soc"
    const val PHONE_BATTERY_SOC = "phoneBatterySOC"
    const val VELOCITY = "velocity"
    const val TOTAL_DISTANCE = "totalDistance"
    const val EPOCH_TIME = "epochTime"
    const val PORT_DISTANCE = "portDistance"
    const val COMPANY_ID = "company_id"
    const val IMAGE_URL = "image_url"
    const val CREATED_AT = "created_at"
    const val UPDATED_AT = "updated_at"

    val TELEMETRY_READ_FIELDS = listOf(
        UUID,
        LATITUDE,
        LONGITUDE,
        ALTITUDE,
        MAGNETIC_X,
        MAGNETIC_Y,
        MAGNETIC_Z,
        SOC,
        PHONE_BATTERY_SOC,
        VELOCITY,
        TOTAL_DISTANCE,
        EPOCH_TIME,
        PORT_DISTANCE,
    )
}
