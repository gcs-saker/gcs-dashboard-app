package kr.co.a4ai.gcssaker.authpolicy.configuration

import com.fasterxml.jackson.databind.ObjectMapper
import io.micrometer.core.instrument.MeterRegistry
import kr.co.a4ai.gcssaker.authpolicy.observability.OperationalEventPipelineMetrics
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationHierarchyRepository
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
    fun operationalReadDependencies(
        dataSource: ObjectProvider<DataSource>,
        redisTemplate: ObjectProvider<StringRedisTemplate>,
        objectMapper: ObjectMapper,
        hierarchy: OrganizationHierarchyRepository,
    ) = OperationalReadDependencies(dataSource, redisTemplate, objectMapper, hierarchy)

    @Bean
    fun operationalReadRepository(settings: AuthRuntimeSettings, dependencies: OperationalReadDependencies): OperationalReadRepository =
        createOperationalReadRepository(settings, dependencies)

    @Bean
    fun operationalEventRepository(
        settings: AuthRuntimeSettings,
        dataSource: ObjectProvider<DataSource>,
    ): OperationalEventRepository =
        createOperationalEventRepository(settings, dataSource)
}
