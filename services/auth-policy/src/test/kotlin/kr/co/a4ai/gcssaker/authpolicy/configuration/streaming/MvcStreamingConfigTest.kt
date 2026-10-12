package kr.co.a4ai.gcssaker.authpolicy.configuration

import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor
import kotlin.test.Test
import kotlin.test.assertEquals

class MvcStreamingConfigTest {
    @Test
    fun `SSE executor has bounded workers and queue capacity`() {
        val executor = MvcStreamingConfig().mvcStreamingTaskExecutor() as ThreadPoolTaskExecutor
        try {
            assertEquals(4, executor.corePoolSize)
            assertEquals(16, executor.maxPoolSize)
            assertEquals(64, executor.threadPoolExecutor.queue.remainingCapacity())
        } finally {
            executor.shutdown()
        }
    }
}
