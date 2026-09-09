package kr.co.a4ai.gcssaker.authpolicy.api

import io.grpc.*
import io.grpc.netty.shaded.io.grpc.netty.GrpcSslContexts
import io.grpc.netty.shaded.io.grpc.netty.NettyServerBuilder
import io.grpc.netty.shaded.io.netty.handler.ssl.ClientAuth
import kr.co.a4ai.gcssaker.authpolicy.api.DevicePolicyRpcService
import kr.co.a4ai.gcssaker.authpolicy.api.MediaPolicyRpcService
import kr.co.a4ai.gcssaker.authpolicy.api.BearerPrincipalResolver
import kr.co.a4ai.gcssaker.authpolicy.application.TelemetryIngestionEffects
import kr.co.a4ai.gcssaker.authpolicy.application.TelemetryIngestionService
import kr.co.a4ai.gcssaker.authpolicy.domain.*
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import java.io.File
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
        environment: Environment,
    ): DevicePolicyRpcRuntime {
        val settings = InternalGrpcSettings.from(environment)
        require(settings.token.length >= 32) { "internal RPC token must contain at least 32 characters" }
        val builder = rpcServerBuilder(settings, environment.activeProfiles.toSet())
        services.forEach { builder.addService(ServerInterceptors.intercept(it, InternalRpcAuthentication(settings.token))) }
        return DevicePolicyRpcRuntime(builder.build().start())
    }

    internal fun rpcServerBuilder(
        settings: InternalGrpcSettings,
        activeProfiles: Set<String>,
    ): ServerBuilder<*> {
        if (settings.allowPlaintext) {
            require("local-test" in activeProfiles) { "plaintext internal RPC is restricted to local-test" }
            return ServerBuilder.forPort(settings.port).maxInboundMessageSize(65536)
        }
        require(settings.tlsFiles().all { it.isNotBlank() }) { "internal RPC mTLS files are required" }
        val ssl = GrpcSslContexts.forServer(File(settings.certFile), File(settings.keyFile))
            .trustManager(File(settings.caFile)).clientAuth(ClientAuth.REQUIRE).build()
        return NettyServerBuilder.forPort(settings.port).sslContext(ssl).maxInboundMessageSize(65536)
    }
}

data class InternalGrpcSettings(
    val port: Int,
    val token: String,
    val caFile: String,
    val certFile: String,
    val keyFile: String,
    val allowPlaintext: Boolean,
) {
    fun tlsFiles() = listOf(caFile, certFile, keyFile)

    companion object {
        fun from(environment: Environment) = InternalGrpcSettings(
            environment.getProperty("gcs.internal-grpc.port", Int::class.java, 9091),
            environment.getRequiredProperty("gcs.internal-grpc.token"),
            environment.getProperty("gcs.internal-grpc.ca-file", ""),
            environment.getProperty("gcs.internal-grpc.cert-file", ""),
            environment.getProperty("gcs.internal-grpc.key-file", ""),
            environment.getProperty("gcs.internal-grpc.allow-plaintext-local-test", Boolean::class.java, false),
        )
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
