package kr.co.a4ai.gcssaker.authpolicy.configuration

import com.fasterxml.jackson.databind.ObjectMapper
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
