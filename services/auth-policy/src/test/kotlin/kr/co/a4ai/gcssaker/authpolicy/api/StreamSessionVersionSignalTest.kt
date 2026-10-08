package kr.co.a4ai.gcssaker.authpolicy.api

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit

class StreamSessionVersionSignalTest {
    @Test
    fun `publish wakes a waiting stream immediately`() {
        val signal = StreamSessionVersionSignal()
        val started = System.nanoTime()
        val waiting = CompletableFuture.supplyAsync { signal.awaitChange(signal.current(), 5_000) }
        Thread.sleep(30)

        val published = signal.publish()
        val observed = waiting.get(1, TimeUnit.SECONDS)

        assertThat(observed).isEqualTo(published)
        assertThat(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started)).isLessThan(1_000)
    }

    @Test
    fun `fallback timeout preserves version for another instance changes`() {
        val signal = StreamSessionVersionSignal()
        val started = System.nanoTime()

        assertThat(signal.awaitChange(signal.current(), 40)).isZero()
        assertThat(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started)).isGreaterThanOrEqualTo(30)
    }
}
