package kr.co.a4ai.gcssaker.authpolicy.configuration

import kr.co.a4ai.gcssaker.authpolicy.application.OperationalFailureLogger
import kr.co.a4ai.gcssaker.authpolicy.application.OperationalFailureLoggerFacade
import kr.co.a4ai.gcssaker.authpolicy.application.RepositorySecurityAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.RepositorySettingsAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.SecurityAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.SettingsAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.MediaLifecycleAuditService
import kr.co.a4ai.gcssaker.authpolicy.application.AuditStorageLimits
import kr.co.a4ai.gcssaker.authpolicy.application.AuditStorageMonitor
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcAuditStorageReader
import kr.co.a4ai.gcssaker.authpolicy.observability.AuditStorageMetrics
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.beans.factory.annotation.Value
import java.time.Duration
import javax.sql.DataSource
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class OperationalAuditConfiguration {
    @Bean
    fun auditStorageReader(dataSource: DataSource) = JdbcAuditStorageReader(dataSource)

    @Bean
    fun auditStorageMetrics(registry: MeterRegistry) = AuditStorageMetrics(registry)

    @Bean
    fun auditStorageMonitor(
        reader: JdbcAuditStorageReader,
        metrics: AuditStorageMetrics,
        @Value("\${AUTH_POLICY_AUDIT_WARNING_RECORDS:800000}") warningRecords: Long,
        @Value("\${AUTH_POLICY_AUDIT_SECURITY_RETENTION_DAYS:365}") securityDays: Long,
        @Value("\${AUTH_POLICY_AUDIT_PRIVILEGED_RETENTION_DAYS:730}") privilegedDays: Long,
    ) = AuditStorageMonitor(
        reader,
        metrics,
        AuditStorageLimits(warningRecords, Duration.ofDays(securityDays), Duration.ofDays(privilegedDays)),
    )

    @Bean
    fun mediaLifecycleAuditService(repository: OperationalEventRepository) = MediaLifecycleAuditService(repository)
    @Bean
    fun settingsAuditPublisher(repository: OperationalEventRepository): SettingsAuditPublisher =
        RepositorySettingsAuditPublisher(repository)

    @Bean
    fun securityAuditPublisher(repository: OperationalEventRepository): SecurityAuditPublisher =
        RepositorySecurityAuditPublisher(repository)

    @Bean
    fun operationalFailureLogger(repository: OperationalEventRepository): OperationalFailureLoggerFacade =
        OperationalFailureLogger(repository)
}
