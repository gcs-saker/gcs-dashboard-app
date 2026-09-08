package kr.co.a4ai.gcssaker.authpolicy.api

import io.grpc.*
import kr.co.a4ai.gcssaker.authpolicy.api.DevicePolicyRpcService
import kr.co.a4ai.gcssaker.authpolicy.api.MediaPolicyRpcService
import kr.co.a4ai.gcssaker.authpolicy.api.BearerPrincipalResolver
import kr.co.a4ai.gcssaker.authpolicy.application.TelemetryIngestionEffects
import kr.co.a4ai.gcssaker.authpolicy.application.TelemetryIngestionService
import kr.co.a4ai.gcssaker.authpolicy.domain.*
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

@Configuration
@ConditionalOnProperty(name = ["gcs.internal-grpc.enabled"], havingValue = "true")
class DevicePolicyRpcConfiguration {
    @Bean
    fun telemetryRpcEffects(geofence: GeofenceTelemetryEvaluator, alerts: TelemetryAlertRuleEngine, publisher: TelemetryPublisher) =
        TelemetryIngestionEffects(geofence, alerts, publisher)

    @Bean
    fun devicePolicyRpcService(
        credentials: DeviceCredentialAuthenticationService,
        repository: OperationalReadRepository,
        effects: TelemetryIngestionEffects,
    ) = DevicePolicyRpcService(credentials, TelemetryIngestionService(repository, effects))

    @Bean
    fun mediaPolicyRpcService(principals: BearerPrincipalResolver, groups: GroupPolicyService, devices: DevicePublishAuthorizationService) =
        MediaPolicyRpcService(principals, groups, devices)

    @Bean(destroyMethod = "close")
    fun devicePolicyRpcServer(
        services: List<BindableService>,
        @Value("\${gcs.internal-grpc.port:9091}") port: Int,
        @Value("\${gcs.internal-grpc.token}") token: String,
    ): DevicePolicyRpcRuntime {
        require(token.length >= 32) { "internal RPC token must contain at least 32 characters" }
        val builder = ServerBuilder.forPort(port).maxInboundMessageSize(65536)
        services.forEach { builder.addService(ServerInterceptors.intercept(it, InternalRpcAuthentication(token))) }
        return DevicePolicyRpcRuntime(builder.build().start())
    }
}

class DevicePolicyRpcRuntime(private val server: Server) : AutoCloseable {
    override fun close() {
        server.shutdown()
        if (!server.awaitTermination(5, TimeUnit.SECONDS)) server.shutdownNow()
    }
}

class InternalRpcAuthentication(private val token: String) : ServerInterceptor {
    override fun <ReqT : Any?, RespT : Any?> interceptCall(
        call: ServerCall<ReqT, RespT>, headers: Metadata, next: ServerCallHandler<ReqT, RespT>,
    ): ServerCall.Listener<ReqT> {
        val supplied = headers.get(Metadata.Key.of("x-gcs-internal-token", Metadata.ASCII_STRING_MARSHALLER)).orEmpty()
        if (!MessageDigest.isEqual(supplied.toByteArray(), token.toByteArray())) {
            call.close(Status.UNAUTHENTICATED.withDescription("internal_auth_required"), Metadata())
            return object : ServerCall.Listener<ReqT>() {}
        }
        return next.startCall(call, headers)
    }
}
