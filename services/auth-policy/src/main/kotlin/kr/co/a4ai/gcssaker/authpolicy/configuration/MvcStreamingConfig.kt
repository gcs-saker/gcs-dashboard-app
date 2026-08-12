package kr.co.a4ai.gcssaker.authpolicy.configuration

import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.task.AsyncTaskExecutor
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor
import org.springframework.web.servlet.config.annotation.AsyncSupportConfigurer
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer
import java.util.concurrent.ThreadPoolExecutor

@Configuration
class MvcStreamingConfig {
    @Bean("mvcStreamingTaskExecutor")
    fun mvcStreamingTaskExecutor(): AsyncTaskExecutor =
        ThreadPoolTaskExecutor().apply {
            corePoolSize = MVC_STREAM_CORE_POOL_SIZE
            maxPoolSize = MVC_STREAM_MAX_POOL_SIZE
            queueCapacity = MVC_STREAM_QUEUE_CAPACITY
            setThreadNamePrefix("auth-policy-stream-")
            setRejectedExecutionHandler(ThreadPoolExecutor.AbortPolicy())
            initialize()
        }

    @Bean
    fun mvcAsyncSupportConfigurer(
        @Qualifier("mvcStreamingTaskExecutor") executor: AsyncTaskExecutor,
    ): WebMvcConfigurer =
        object : WebMvcConfigurer {
            override fun configureAsyncSupport(configurer: AsyncSupportConfigurer) {
                configurer.setTaskExecutor(executor)
                configurer.setDefaultTimeout(MVC_STREAM_TIMEOUT_MILLIS)
            }
        }

    private companion object {
        const val MVC_STREAM_CORE_POOL_SIZE = 4
        const val MVC_STREAM_MAX_POOL_SIZE = 16
        const val MVC_STREAM_QUEUE_CAPACITY = 64
        const val MVC_STREAM_TIMEOUT_MILLIS = 35_000L
    }
}
