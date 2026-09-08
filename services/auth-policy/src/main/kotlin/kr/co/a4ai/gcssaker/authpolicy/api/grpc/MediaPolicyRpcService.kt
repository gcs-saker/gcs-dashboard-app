package kr.co.a4ai.gcssaker.authpolicy.api

import io.grpc.Status
import io.grpc.stub.StreamObserver
import kr.co.a4ai.gcssaker.authpolicy.domain.*
import kr.co.a4ai.gcssaker.contracts.v1.*
import java.time.Instant

class MediaPolicyRpcService(
    private val principals: BearerPrincipalResolver,
    private val groups: GroupPolicyService,
    private val devices: DevicePublishAuthorizationService,
) : MediaPolicyServiceGrpc.MediaPolicyServiceImplBase() {
    override fun authorizeStream(request: StreamAccessInput, response: StreamObserver<StreamAccessOutput>) = reply(response) {
        val principal = principals.requirePrincipal(request.authorization)
        val group = GroupId(request.publisherGroupId)
        val decision = when (request.action.ifBlank { "view_stream" }) {
            "view_stream" -> groups.canViewStream(principal, StreamSessionDescriptor(StreamPath(request.path), group, Instant.EPOCH))
            "send_talkback" -> groups.canSendTalkback(principal, group)
            else -> throw IllegalArgumentException("unsupported_action")
        }
        StreamAccessOutput.newBuilder().setAllowed(decision.allowed).setStreamId(request.streamId)
            .setPrincipalId(principal.username).setGroupId(principal.groupId.value)
            .setExpiresUnixMillis(Instant.now().plusSeconds(2).toEpochMilli()).build()
    }

    override fun authorizeDevicePublish(request: DevicePublishInput, response: StreamObserver<PublishBindingOutput>) = reply(response) {
        publishBinding(devices.authorize(DevicePublishAuthorizationCommand(request.deviceUuid, request.credential, request.sensorId)))
    }

    override fun authorizeAccountPublish(request: AccountPublishInput, response: StreamObserver<PublishBindingOutput>) = reply(response) {
        publishBinding(AccountPublishAuthorizationService(groups).authorize(principals.requirePrincipal(request.authorization), request.sensorId))
    }

    private fun publishBinding(binding: DevicePublishAuthorization): PublishBindingOutput = PublishBindingOutput.newBuilder()
        .setDeviceUuid(binding.deviceUuid).setGroupId(binding.publisherGroupId.value).setSensorId(binding.sensorId)
        .setStreamId(binding.streamId).setPath(binding.path).setCredentialVersion(binding.credentialVersion)
        .setPolicyVersion(binding.devicePolicyVersion).build()

    private fun <T> reply(observer: StreamObserver<T>, action: () -> T) {
        try {
            observer.onNext(action())
            observer.onCompleted()
        } catch (error: UnauthorizedApiError) {
            observer.onError(Status.UNAUTHENTICATED.withDescription("authentication_required").asRuntimeException())
        } catch (error: DevicePublishAuthorizationRejectedException) {
            observer.onError(Status.PERMISSION_DENIED.withDescription("device_policy_denied").asRuntimeException())
        } catch (error: IllegalArgumentException) {
            observer.onError(Status.INVALID_ARGUMENT.withDescription("policy_request_invalid").asRuntimeException())
        } catch (error: IllegalStateException) {
            observer.onError(Status.PERMISSION_DENIED.withDescription("policy_denied").asRuntimeException())
        } catch (error: RuntimeException) {
            observer.onError(Status.UNAVAILABLE.withDescription("policy_unavailable").asRuntimeException())
        }
    }
}
