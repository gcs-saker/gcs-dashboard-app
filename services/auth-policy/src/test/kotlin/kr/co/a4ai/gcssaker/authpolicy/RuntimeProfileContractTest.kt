package kr.co.a4ai.gcssaker.authpolicy

import org.springframework.beans.factory.config.YamlPropertiesFactoryBean
import org.springframework.core.io.ClassPathResource
import kotlin.test.Test
import kotlin.test.assertEquals

class RuntimeProfileContractTest {
    @Test
    fun `application profile enables java 21 virtual threads`() {
        val properties = YamlPropertiesFactoryBean().apply {
            setResources(ClassPathResource("application.yml"))
        }.`object`

        assertEquals("true", properties?.getProperty(VIRTUAL_THREADS_ENABLED_PROPERTY))
        assertEquals("graceful", properties?.getProperty(SERVER_SHUTDOWN_PROPERTY))
    }

    private companion object {
        const val VIRTUAL_THREADS_ENABLED_PROPERTY = "spring.threads.virtual.enabled"
        const val SERVER_SHUTDOWN_PROPERTY = "server.shutdown"
    }
}
