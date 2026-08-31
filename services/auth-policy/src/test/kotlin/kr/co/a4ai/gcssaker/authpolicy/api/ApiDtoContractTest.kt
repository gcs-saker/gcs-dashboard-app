package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.reflect.full.declaredFunctions
import kotlin.reflect.full.findAnnotation

class ApiDtoContractTest {
    private val objectMapper = ObjectMapper()
        .registerKotlinModule()
        .registerModule(JavaTimeModule())

    @Test
    fun `operational event dto field contract carries stream session and ice diagnostics`() {
        val payload = objectMapper.writeValueAsString(
            OperationalEventResponse(
                id = ApiContractFixtures.EVENT_ID_VALUE,
                occurredAt = ApiContractFixtures.INSTANT_VALUE,
                severity = ApiContractFixtures.SEVERITY_VALUE,
                category = ApiContractFixtures.EVENT_CATEGORY_VALUE,
                eventType = ApiContractFixtures.EVENT_TYPE_VALUE,
                sourceService = ApiContractFixtures.SOURCE_SERVICE_VALUE,
                source = ApiContractFixtures.EVENT_SOURCE_VALUE,
                message = ApiContractFixtures.EVENT_MESSAGE_VALUE,
                connections = ApiContractFixtures.CONNECTIONS_VALUE,
                latencyMs = ApiContractFixtures.MIN_LATENCY_MS_VALUE,
                throughputMbps = ApiContractFixtures.AVG_THROUGHPUT_MBPS_VALUE,
                streamId = ApiContractFixtures.STREAM_ID_VALUE,
                connectionId = ApiContractFixtures.CONNECTION_ID_VALUE,
                icePath = ApiContractFixtures.ICE_PATH_VALUE,
                relayFallbackReason = ApiContractFixtures.RELAY_FALLBACK_REASON_VALUE,
            ),
        )

        assertTrue(payload.contains(quoted(OperationalEventApiFields.EVENT_TYPE)))
        assertTrue(payload.contains(quoted(OperationalEventApiFields.SOURCE_SERVICE)))
        assertTrue(payload.contains(quoted(OperationalEventApiFields.STREAM_ID)))
        assertTrue(payload.contains(quoted(OperationalEventApiFields.CONNECTION_ID)))
        assertTrue(payload.contains(quoted(OperationalEventApiFields.ICE_PATH)))
        assertTrue(payload.contains(quoted(OperationalEventApiFields.RELAY_FALLBACK_REASON)))
    }

    @Test
    fun `stream policy dto field contract stays compatible with media control`() {
        val payload = objectMapper.writeValueAsString(
            StreamAccessRequest(
                streamId = ApiContractFixtures.STREAM_ID_VALUE,
                path = ApiContractFixtures.STREAM_PATH_VALUE,
                publisherGroupId = ApiContractFixtures.GROUP_ID_VALUE,
            ),
        )

        assertTrue(payload.contains(quoted(StreamPolicyApiFields.STREAM_ID)))
        assertTrue(payload.contains(quoted(StreamPolicyApiFields.PUBLISHER_GROUP_ID)))
        assertFalse(payload.contains(quoted(ApiContractFixtures.PUBLISHER_GROUP_ID_CAMEL_CASE_MISS)))

        val responsePayload = objectMapper.writeValueAsString(
            StreamAccessResponse(
                streamId = ApiContractFixtures.STREAM_ID_VALUE,
                allowed = true,
                reason = ApiContractFixtures.STREAM_ACCESS_REASON_VALUE,
                principalId = ApiContractFixtures.USERNAME_VALUE,
                username = ApiContractFixtures.USERNAME_VALUE,
                role = ApiContractFixtures.ROLE_VALUE,
                groupId = ApiContractFixtures.GROUP_ID_VALUE,
                expiresAt = Instant.parse(ApiContractFixtures.STREAM_ACCESS_EXPIRES_AT_VALUE),
                policyVersion = ApiContractFixtures.POLICY_VERSION_VALUE,
                principalVersion = ApiContractFixtures.PRINCIPAL_VERSION_VALUE,
                permissions = listOf(ApiContractFixtures.PERMISSION_VIEW_STREAM_VALUE),
            ),
        )

        assertTrue(responsePayload.contains(quoted(StreamPolicyApiFields.PERMISSIONS)))
        assertTrue(responsePayload.contains(quoted(StreamPolicyApiFields.PRINCIPAL_ID)))
        assertTrue(responsePayload.contains(quoted(StreamPolicyApiFields.EXPIRES_AT)))
        assertTrue(responsePayload.contains(quoted(StreamPolicyApiFields.POLICY_VERSION)))
        assertTrue(responsePayload.contains(quoted(StreamPolicyApiFields.PRINCIPAL_VERSION)))
        assertTrue(responsePayload.contains(quoted(ApiContractFixtures.PERMISSION_VIEW_STREAM_VALUE)))
    }

    @Test
    fun `device publish authorization request does not accept group id`() {
        val requestPayload = objectMapper.writeValueAsString(
            DevicePublishAuthorizationRequest(
                deviceUuid = ApiContractFixtures.DEVICE_UUID_VALUE,
                credential = ApiContractFixtures.DEVICE_CREDENTIAL_VALUE,
                sensorId = "front",
            ),
        )
        val responsePayload = objectMapper.writeValueAsString(
            DevicePublishAuthorizationResponse(
                deviceUuid = ApiContractFixtures.DEVICE_UUID_VALUE,
                streamId = ApiContractFixtures.STREAM_ID_VALUE,
                path = ApiContractFixtures.STREAM_PATH_VALUE,
                sensorId = "front",
                publisherGroupId = ApiContractFixtures.GROUP_ID_VALUE,
                credentialVersion = 1,
                devicePolicyVersion = 1,
                reason = ApiContractFixtures.DEVICE_AUTH_REASON_VALUE,
                policyVersion = ApiContractFixtures.DEVICE_POLICY_VERSION_VALUE,
            ),
        )

        assertTrue(requestPayload.contains(quoted(DevicePolicyApiFields.DEVICE_UUID)))
        assertTrue(requestPayload.contains(quoted(DevicePolicyApiFields.CREDENTIAL)))
        assertFalse(requestPayload.contains(quoted(DevicePolicyApiFields.STREAM_ID)))
        assertFalse(requestPayload.contains(quoted(DevicePolicyApiFields.PATH)))
        assertFalse(requestPayload.contains(quoted(DevicePolicyApiFields.PUBLISHER_GROUP_ID)))
        assertFalse(requestPayload.contains(quoted(StreamPolicyApiFields.GROUP_ID)))
        assertTrue(responsePayload.contains(quoted(DevicePolicyApiFields.PUBLISHER_GROUP_ID)))
        assertTrue(responsePayload.contains(quoted(DevicePolicyApiFields.POLICY_VERSION)))
    }

    @Test
    fun `admin device lifecycle dto returns credential only for issue responses`() {
        val requestPayload = objectMapper.writeValueAsString(
            RegisterDeviceRequest(
                groupId = ApiContractFixtures.GROUP_ID_VALUE,
                displayName = ApiContractFixtures.DEVICE_DISPLAY_NAME_VALUE,
                deviceType = ApiContractFixtures.DEVICE_TYPE_VALUE,
                sensors = listOf(ApiContractFixtures.sensorRequest()),
                streamPaths = listOf(ApiContractFixtures.streamRequest()),
            ),
        )
        val credentialPayload = objectMapper.writeValueAsString(
            DeviceCredentialIssueResponse(
                deviceUuid = ApiContractFixtures.DEVICE_UUID_VALUE,
                deviceType = ApiContractFixtures.DEVICE_TYPE_VALUE,
                credential = ApiContractFixtures.DEVICE_CREDENTIAL_VALUE,
                groupId = ApiContractFixtures.GROUP_ID_VALUE,
                displayName = ApiContractFixtures.DEVICE_DISPLAY_NAME_VALUE,
                status = ApiContractFixtures.DEVICE_STATUS_VALUE,
                sensors = listOf(ApiContractFixtures.sensorResponse()),
                streamPaths = listOf(ApiContractFixtures.streamResponse()),
            ),
        )
        val statusPayload = objectMapper.writeValueAsString(
            RegisteredDeviceResponse(
                deviceUuid = ApiContractFixtures.DEVICE_UUID_VALUE,
                deviceType = ApiContractFixtures.DEVICE_TYPE_VALUE,
                groupId = ApiContractFixtures.GROUP_ID_VALUE,
                displayName = ApiContractFixtures.DEVICE_DISPLAY_NAME_VALUE,
                status = ApiContractFixtures.DEVICE_STATUS_VALUE,
                sensors = listOf(ApiContractFixtures.sensorResponse()),
                streamPaths = listOf(ApiContractFixtures.streamResponse()),
            ),
        )
        val updatePayload = objectMapper.writeValueAsString(
            UpdateDeviceRequest(
                groupId = ApiContractFixtures.GROUP_ID_VALUE,
                displayName = ApiContractFixtures.DEVICE_DISPLAY_NAME_VALUE,
                status = ApiContractFixtures.DEVICE_STATUS_VALUE,
                deviceType = ApiContractFixtures.DEVICE_TYPE_VALUE,
                sensors = listOf(ApiContractFixtures.sensorRequest()),
                streamPaths = listOf(ApiContractFixtures.streamRequest()),
            ),
        )

        assertTrue(requestPayload.contains(quoted(AdminDeviceApiFields.GROUP_ID)))
        assertTrue(requestPayload.contains(quoted(AdminDeviceApiFields.DISPLAY_NAME)))
        assertTrue(requestPayload.contains(quoted(AdminDeviceApiFields.DEVICE_TYPE)))
        assertTrue(requestPayload.contains(quoted(AdminDeviceApiFields.SENSORS)))
        assertTrue(requestPayload.contains(quoted(AdminDeviceApiFields.STREAM_PATHS)))
        assertFalse(requestPayload.contains(quoted(AdminDeviceApiFields.DEVICE_UUID)))
        assertTrue(updatePayload.contains(quoted(AdminDeviceApiFields.STATUS)))
        assertFalse(updatePayload.contains(quoted(AdminDeviceApiFields.CREDENTIAL)))
        assertTrue(credentialPayload.contains(quoted(AdminDeviceApiFields.CREDENTIAL)))
        assertTrue(statusPayload.contains(quoted(AdminDeviceApiFields.DEVICE_UUID)))
        assertFalse(statusPayload.contains(quoted(AdminDeviceApiFields.CREDENTIAL)))
    }

    @Test
    fun `device bootstrap dto issues identity without accepting group id`() {
        val requestPayload = objectMapper.writeValueAsString(
            DeviceBootstrapRequest(
                provisioningToken = ApiContractFixtures.PROVISIONING_TOKEN_VALUE,
                displayName = ApiContractFixtures.DEVICE_DISPLAY_NAME_VALUE,
                deviceType = ApiContractFixtures.DEVICE_TYPE_VALUE,
                sensors = listOf(ApiContractFixtures.sensorRequest()),
                streamPaths = listOf(ApiContractFixtures.streamRequest()),
            ),
        )
        val responsePayload = objectMapper.writeValueAsString(
            DeviceBootstrapResponse(
                deviceUuid = ApiContractFixtures.DEVICE_UUID_VALUE,
                deviceType = ApiContractFixtures.DEVICE_TYPE_VALUE,
                credential = ApiContractFixtures.DEVICE_CREDENTIAL_VALUE,
                displayName = ApiContractFixtures.DEVICE_DISPLAY_NAME_VALUE,
                status = ApiContractFixtures.DEVICE_STATUS_VALUE,
                sensors = listOf(ApiContractFixtures.sensorResponse()),
                streamPaths = listOf(ApiContractFixtures.streamResponse()),
            ),
        )

        assertTrue(requestPayload.contains(quoted(DeviceBootstrapApiFields.PROVISIONING_TOKEN)))
        assertTrue(requestPayload.contains(quoted(DeviceBootstrapApiFields.DISPLAY_NAME)))
        assertTrue(requestPayload.contains(quoted(DeviceBootstrapApiFields.DEVICE_TYPE)))
        assertFalse(requestPayload.contains(quoted(DeviceBootstrapApiFields.DEVICE_UUID)))
        assertFalse(requestPayload.contains(quoted(AdminDeviceApiFields.GROUP_ID)))
        assertTrue(responsePayload.contains(quoted(DeviceBootstrapApiFields.DEVICE_UUID)))
        assertTrue(responsePayload.contains(quoted(DeviceBootstrapApiFields.CREDENTIAL)))
        assertFalse(responsePayload.contains(quoted(AdminDeviceApiFields.GROUP_ID)))
    }

    @Test
    fun `provisioning token dto exposes raw token only in issue response`() {
        val requestPayload = objectMapper.writeValueAsString(
            IssueProvisioningTokenRequest(
                groupId = ApiContractFixtures.GROUP_ID_VALUE,
                label = ApiContractFixtures.PROVISIONING_TOKEN_LABEL_VALUE,
                ttlMinutes = ApiContractFixtures.PROVISIONING_TOKEN_TTL_VALUE,
                maxUses = ApiContractFixtures.PROVISIONING_TOKEN_MAX_USES_VALUE,
            ),
        )
        val issuePayload = objectMapper.writeValueAsString(
            ProvisioningTokenIssueResponse(
                tokenId = ApiContractFixtures.PROVISIONING_TOKEN_ID_VALUE,
                token = ApiContractFixtures.PROVISIONING_TOKEN_VALUE,
                groupId = ApiContractFixtures.GROUP_ID_VALUE,
                label = ApiContractFixtures.PROVISIONING_TOKEN_LABEL_VALUE,
                status = ApiContractFixtures.DEVICE_STATUS_VALUE,
                maxUses = ApiContractFixtures.PROVISIONING_TOKEN_MAX_USES_VALUE,
                usedCount = 0,
                expiresAt = ApiContractFixtures.INSTANT_VALUE.toString(),
                createdBy = ApiContractFixtures.USERNAME_VALUE,
                createdAt = ApiContractFixtures.INSTANT_VALUE.toString(),
            ),
        )
        val recordPayload = objectMapper.writeValueAsString(
            ProvisioningTokenRecordResponse(
                tokenId = ApiContractFixtures.PROVISIONING_TOKEN_ID_VALUE,
                groupId = ApiContractFixtures.GROUP_ID_VALUE,
                label = ApiContractFixtures.PROVISIONING_TOKEN_LABEL_VALUE,
                status = ApiContractFixtures.DEVICE_STATUS_VALUE,
                maxUses = ApiContractFixtures.PROVISIONING_TOKEN_MAX_USES_VALUE,
                usedCount = 0,
                expiresAt = ApiContractFixtures.INSTANT_VALUE.toString(),
                createdBy = ApiContractFixtures.USERNAME_VALUE,
                createdAt = ApiContractFixtures.INSTANT_VALUE.toString(),
            ),
        )

        assertTrue(requestPayload.contains(quoted(AdminProvisioningTokenApiFields.GROUP_ID)))
        assertTrue(requestPayload.contains(quoted(AdminProvisioningTokenApiFields.LABEL)))
        assertTrue(requestPayload.contains(quoted(AdminProvisioningTokenApiFields.TTL_MINUTES)))
        assertTrue(issuePayload.contains(quoted(AdminProvisioningTokenApiFields.TOKEN)))
        assertFalse(recordPayload.contains(quoted(AdminProvisioningTokenApiFields.TOKEN)))
    }

    private fun quoted(value: String): String = "\"$value\""
}
