package kr.co.a4ai.gcssaker.authpolicy.configuration

import com.fasterxml.jackson.databind.ObjectMapper
import kr.co.a4ai.gcssaker.authpolicy.application.AsyncOperationalAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.InMemoryOperationalAuditSink
import kr.co.a4ai.gcssaker.authpolicy.application.NoopOperationalAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.OperationalAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.OperationalAuditPublisherMetrics
import kr.co.a4ai.gcssaker.authpolicy.application.OperationalFailureLogger
import kr.co.a4ai.gcssaker.authpolicy.application.OperationalFailureLoggerFacade
import kr.co.a4ai.gcssaker.authpolicy.application.RepositorySecurityAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.RepositorySettingsAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.SecurityAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.SettingsAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.GeofenceRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.GeofenceTelemetryEvaluator
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryGeofenceRepository
import kr.co.a4ai.gcssaker.authpolicy.observability.AuthPolicyObservation
import io.micrometer.observation.ObservationRegistry
import org.springframework.beans.factory.ObjectProvider
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.task.TaskExecutor
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor
import org.springframework.scheduling.annotation.EnableScheduling
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryAlertRuleEngine
import java.util.concurrent.ThreadPoolExecutor
import javax.sql.DataSource

@Configuration
@EnableScheduling
class OperationalPolicyConfig {
    @Bean
    fun geofenceRepository(): GeofenceRepository = InMemoryGeofenceRepository()

    @Bean
    fun geofenceTelemetryEvaluator(
        geofences: GeofenceRepository,
        events: OperationalEventRepository,
    ): GeofenceTelemetryEvaluator = GeofenceTelemetryEvaluator(geofences, events)

    @Bean
    fun telemetryAlertRuleEngine(events: OperationalEventRepository): TelemetryAlertRuleEngine =
        TelemetryAlertRuleEngine(events)

    @Bean
    fun operationalPostProcessingExecutor(settings: AuthRuntimeSettings): TaskExecutor =
        ThreadPoolTaskExecutor().apply {
            corePoolSize = settings.postProcessingCorePoolSize
            maxPoolSize = settings.postProcessingMaxPoolSize
            queueCapacity = settings.postProcessingQueueCapacity
            setThreadNamePrefix("auth-policy-post-")
            setRejectedExecutionHandler(ThreadPoolExecutor.CallerRunsPolicy())
            initialize()
        }

    @Bean
    fun operationalAuditSink(): InMemoryOperationalAuditSink = InMemoryOperationalAuditSink()

    @Bean
    fun operationalAuditPublisherMetrics(): OperationalAuditPublisherMetrics = OperationalAuditPublisherMetrics()

    @Bean
    fun operationalAuditPublisher(
        settings: AuthRuntimeSettings,
        operationalPostProcessingExecutor: TaskExecutor,
        auditSink: InMemoryOperationalAuditSink,
        auditMetrics: OperationalAuditPublisherMetrics,
    ): OperationalAuditPublisher =
        if (settings.asyncPostProcessingEnabled) {
            AsyncOperationalAuditPublisher(operationalPostProcessingExecutor, auditSink, auditMetrics)
        } else {
            NoopOperationalAuditPublisher
        }

    @Bean
    fun settingsAuditPublisher(repository: OperationalEventRepository): SettingsAuditPublisher =
        RepositorySettingsAuditPublisher(repository)

    @Bean
    fun securityAuditPublisher(repository: OperationalEventRepository): SecurityAuditPublisher =
        RepositorySecurityAuditPublisher(repository)

    @Bean
    fun operationalFailureLogger(repository: OperationalEventRepository): OperationalFailureLoggerFacade =
        OperationalFailureLogger(repository)

    @Bean
    fun authPolicyObservation(registry: ObservationRegistry): AuthPolicyObservation =
        AuthPolicyObservation(registry)

    @Bean
    fun operationalReadRepository(
        settings: AuthRuntimeSettings,
        dataSource: ObjectProvider<DataSource>,
        redisTemplate: ObjectProvider<StringRedisTemplate>,
        objectMapper: ObjectMapper,
    ): OperationalReadRepository =
        createOperationalReadRepository(settings, dataSource, redisTemplate, objectMapper)

    @Bean
    fun operationalEventRepository(
        settings: AuthRuntimeSettings,
        dataSource: ObjectProvider<DataSource>,
        redisTemplate: ObjectProvider<StringRedisTemplate>,
        objectMapper: ObjectMapper,
    ): OperationalEventRepository =
        createOperationalEventRepository(settings, dataSource, redisTemplate, objectMapper)
}
