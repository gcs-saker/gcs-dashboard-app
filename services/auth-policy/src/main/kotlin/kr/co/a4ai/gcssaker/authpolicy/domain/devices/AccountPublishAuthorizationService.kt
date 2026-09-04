package kr.co.a4ai.gcssaker.authpolicy.domain

import java.security.MessageDigest

class AccountPublishAuthorizationService(private val groupPolicy: GroupPolicyService) {
    fun authorize(principal: AuthenticatedPrincipal, sensor: String): DevicePublishAuthorization {
        check(Permission.PUBLISH_STREAM in groupPolicy.permissionsFor(principal.role)) { "publish_permission_required" }
        val sensorId = sensor.trim().lowercase()
        require(sensorId.matches(Regex("[a-z0-9][a-z0-9_-]{0,127}"))) { "sensor_id_invalid" }
        val accountId = MessageDigest.getInstance("SHA-256").digest(principal.username.trim().lowercase().toByteArray())
            .take(12).joinToString("") { byte -> "%02x".format(byte) }
        val publisher = "account-$accountId"
        return DevicePublishAuthorization(
            deviceUuid = publisher, streamId = "raw.$publisher.$sensorId", path = "raw/$publisher/$sensorId",
            sensorId = sensorId, publisherGroupId = principal.groupId, credentialVersion = 0, devicePolicyVersion = 1,
            reason = "account group authorized",
        )
    }
}
