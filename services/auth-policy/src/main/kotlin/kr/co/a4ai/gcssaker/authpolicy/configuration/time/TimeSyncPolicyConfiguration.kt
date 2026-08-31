package kr.co.a4ai.gcssaker.authpolicy.configuration

import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncConfigRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncStatusService
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment

/** Time synchronization policy composition. */
@Configuration
class TimeSyncPolicyConfiguration {
    @Bean
    fun timeSyncConfigRepository(env: Environment): TimeSyncConfigRepository = timeSyncConfigRepositoryFromEnvironment(env)

    @Bean
    fun timeSyncStatusService(repository: TimeSyncConfigRepository): TimeSyncStatusService = TimeSyncStatusService(repository)
}
