package kr.co.a4ai.gcssaker.authpolicy.domain

data class RegisteredDeviceStreamIdentity(val streamId: String, val path: String) {
    companion object {
        fun from(deviceUuid: String, sensorId: String): RegisteredDeviceStreamIdentity {
            val safeDevice = canonicalSegment(deviceUuid, "device uuid")
            val safeSensor = canonicalSegment(sensorId, "sensor id")
            return RegisteredDeviceStreamIdentity(
                streamId = "raw.$safeDevice.$safeSensor",
                path = "raw/$safeDevice/$safeSensor",
            )
        }

        private fun canonicalSegment(value: String, label: String): String {
            val normalized = value.trim().lowercase()
            require(normalized.matches(Regex("[a-z0-9][a-z0-9_-]{0,127}"))) { "$label is invalid" }
            return normalized
        }
    }
}
