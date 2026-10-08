package kr.co.a4ai.gcssaker.authpolicy.application

import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import java.util.concurrent.TimeUnit
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

interface OperationalEventSignal {
    fun snapshot(): Long
    fun awaitChange(observedVersion: Long, timeoutMillis: Long): Long
    fun publish()
}

object NoopOperationalEventSignal : OperationalEventSignal {
    override fun snapshot(): Long = 0

    override fun awaitChange(observedVersion: Long, timeoutMillis: Long): Long {
        if (timeoutMillis > 0) TimeUnit.MILLISECONDS.sleep(timeoutMillis)
        return observedVersion
    }

    override fun publish() = Unit
}

class LocalOperationalEventSignal : OperationalEventSignal {
    private val lock = ReentrantLock()
    private val changed = lock.newCondition()
    private var version = 0L

    override fun snapshot(): Long = lock.withLock { version }

    override fun awaitChange(observedVersion: Long, timeoutMillis: Long): Long = lock.withLock {
        if (version == observedVersion && timeoutMillis > 0) {
            changed.await(timeoutMillis, TimeUnit.MILLISECONDS)
        }
        version
    }

    override fun publish() {
        lock.withLock {
            version += 1
            changed.signalAll()
        }
    }
}

class SignalingOperationalEventRepository(
    private val delegate: OperationalEventRepository,
    private val signal: OperationalEventSignal,
) : OperationalEventRepository by delegate {
    override fun append(event: OperationalEventReadModel) {
        delegate.append(event)
        signal.publish()
    }
}
