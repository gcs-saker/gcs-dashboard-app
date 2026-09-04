package kr.co.a4ai.gcssaker.authpolicy

import io.grpc.Status
import io.grpc.stub.StreamObserver
import kr.co.a4ai.gcssaker.authpolicy.api.BearerPrincipalResolver
import kr.co.a4ai.gcssaker.authpolicy.api.MediaPolicyRpcService
import kr.co.a4ai.gcssaker.authpolicy.api.UnauthorizedApiError
import kr.co.a4ai.gcssaker.authpolicy.domain.*
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.devices.InMemoryRegisteredDeviceRepository
import kr.co.a4ai.gcssaker.contracts.v1.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.mockito.Mockito

class MediaPolicyRpcTest {
    private val principals = Mockito.mock(BearerPrincipalResolver::class.java)
    private val groups = GroupPolicyService(listOf(
        OrganizationUnit(GroupId("parent"), "Parent", GroupType.BATTALION),
        OrganizationUnit(GroupId("child"), "Child", GroupType.COMPANY, GroupId("parent")),
        OrganizationUnit(GroupId("other"), "Other", GroupType.COMPANY),
    ))
    private val service = MediaPolicyRpcService(principals, groups,
        DevicePublishAuthorizationService(InMemoryRegisteredDeviceRepository(), PasswordHasher(iterations = 1000)))

    @Test
    fun `stream RPC applies same group and ancestor policy without granting operator descendant access`() {
        val cases = listOf(
            Triple(UserRole.GROUP_ADMIN, "parent", true), Triple(UserRole.OPERATOR, "parent", false),
            Triple(UserRole.VIEWER, "child", true), Triple(UserRole.GROUP_ADMIN, "other", false),
        )
        cases.forEach { (role, group, allowed) ->
            Mockito.`when`(principals.requirePrincipal("Bearer fixture")).thenReturn(AuthenticatedPrincipal("fixture", role, GroupId(group)))
            val response = Capture<StreamAccessOutput>()
            service.authorizeStream(StreamAccessInput.newBuilder().setAuthorization("Bearer fixture")
                .setStreamId("raw.device.test").setPath("raw/device/test").setPublisherGroupId("child").build(), response)
            assertNull(response.error)
            assertEquals(allowed, response.value?.allowed)
        }
    }

    @Test
    fun `RPC denies missing principal and malformed actions`() {
        Mockito.`when`(principals.requirePrincipal("")).thenThrow(UnauthorizedApiError("authentication_required"))
        val missing = Capture<StreamAccessOutput>()
        service.authorizeStream(StreamAccessInput.getDefaultInstance(), missing)
        assertEquals(Status.Code.UNAUTHENTICATED, Status.fromThrowable(requireNotNull(missing.error)).code)
        Mockito.`when`(principals.requirePrincipal("Bearer fixture")).thenReturn(AuthenticatedPrincipal("fixture", UserRole.VIEWER, GroupId("child")))
        val malformed = Capture<StreamAccessOutput>()
        service.authorizeStream(StreamAccessInput.newBuilder().setAuthorization("Bearer fixture").setPublisherGroupId("child")
            .setAction("unknown").build(), malformed)
        assertEquals(Status.Code.INVALID_ARGUMENT, Status.fromThrowable(requireNotNull(malformed.error)).code)
    }

    @Test
    fun `account publish RPC derives principal group and denies viewer`() {
        val request = AccountPublishInput.newBuilder().setAuthorization("Bearer fixture").setSensorId("front").build()
        Mockito.`when`(principals.requirePrincipal("Bearer fixture")).thenReturn(AuthenticatedPrincipal("fixture", UserRole.OPERATOR, GroupId("child")))
        val allowed = Capture<PublishBindingOutput>()
        service.authorizeAccountPublish(request, allowed)
        assertNull(allowed.error)
        assertEquals("child", allowed.value?.groupId)
        Mockito.`when`(principals.requirePrincipal("Bearer fixture")).thenReturn(AuthenticatedPrincipal("fixture", UserRole.VIEWER, GroupId("child")))
        val denied = Capture<PublishBindingOutput>()
        service.authorizeAccountPublish(request, denied)
        assertEquals(Status.Code.PERMISSION_DENIED, Status.fromThrowable(requireNotNull(denied.error)).code)
    }

    private class Capture<T> : StreamObserver<T> {
        var value: T? = null
        var error: Throwable? = null
        override fun onNext(result: T) { value = result }
        override fun onError(failure: Throwable) { error = failure }
        override fun onCompleted() = Unit
    }
}
