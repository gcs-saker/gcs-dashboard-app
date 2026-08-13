package kr.co.a4ai.gcssaker.authpolicy.configuration

import kr.co.a4ai.gcssaker.authpolicy.application.AsyncOperationalAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.InMemoryOperationalAuditSink
import kr.co.a4ai.gcssaker.authpolicy.application.NoopOperationalAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.OperationalAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.OperationalAuditPublisherMetrics
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.task.TaskExecutor
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor
import java.util.concurrent.ThreadPoolExecutor

@Configuration
class OperationalPostProcessingConfiguration {
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
}
