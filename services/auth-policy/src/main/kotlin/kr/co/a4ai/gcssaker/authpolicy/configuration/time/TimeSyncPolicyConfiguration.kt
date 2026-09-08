package kr.co.a4ai.gcssaker.authpolicy.configuration

import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncConfigRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncStatusService
import kr.co.a4ai.gcssaker.authpolicy.application.AuditClockMonitor
import kr.co.a4ai.gcssaker.authpolicy.application.AuditClockState
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.time.UdpNtpTimeProbe
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment

/** Time synchronization policy composition. */
@Configuration
class TimeSyncPolicyConfiguration {
    @Bean
    fun timeSyncConfigRepository(env: Environment): TimeSyncConfigRepository = timeSyncConfigRepositoryFromEnvironment(env)

    @Bean
    fun auditClockState() = AuditClockState()

    @Bean
    fun ntpTimeProbe() = UdpNtpTimeProbe()

    @Bean
    fun auditClockMonitor(repository: TimeSyncConfigRepository, probe: UdpNtpTimeProbe, state: AuditClockState) =
        AuditClockMonitor(repository, probe, state)

    @Bean
    fun timeSyncStatusService(repository: TimeSyncConfigRepository, clockState: AuditClockState): TimeSyncStatusService =
        TimeSyncStatusService(repository, evidence = clockState)
}
