package kr.co.a4ai.gcssaker.authpolicy.api

import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

class StreamSessionVersionSignal {
    private val version = AtomicLong(0)
    private val lock = ReentrantLock()
    private val changed = lock.newCondition()

    fun current(): Long = version.get()

    fun publish(): Long = lock.withLock {
        val next = version.incrementAndGet()
        changed.signalAll()
        next
    }

    fun awaitChange(observed: Long, fallbackMillis: Long): Long = lock.withLock {
        if (version.get() == observed && fallbackMillis > 0) {
            try {
                changed.await(fallbackMillis, TimeUnit.MILLISECONDS)
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
            }
        }
        version.get()
    }
}
