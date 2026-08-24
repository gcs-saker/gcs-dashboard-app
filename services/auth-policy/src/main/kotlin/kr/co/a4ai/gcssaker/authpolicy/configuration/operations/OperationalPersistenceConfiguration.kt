package kr.co.a4ai.gcssaker.authpolicy.configuration

import com.fasterxml.jackson.databind.ObjectMapper
import io.micrometer.core.instrument.MeterRegistry
import kr.co.a4ai.gcssaker.authpolicy.observability.OperationalEventPipelineMetrics
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalReadRepository
import org.springframework.beans.factory.ObjectProvider
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.data.redis.core.StringRedisTemplate
import javax.sql.DataSource

@Configuration
class OperationalPersistenceConfiguration {
    @Bean
    fun operationalEventPipelineMetrics(registry: MeterRegistry): OperationalEventPipelineMetrics =
        OperationalEventPipelineMetrics(registry)

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
    ): OperationalEventRepository =
        createOperationalEventRepository(settings, dataSource)
}
