package kr.co.a4ai.gcssaker.authpolicy

import org.springframework.data.redis.core.StringRedisTemplate
import java.time.Duration

interface StringKeyValueStore {
    fun get(key: String): String?
    fun getAndDelete(key: String): String?
    fun set(key: String, value: String, ttl: Duration)
    fun delete(key: String)
}

class RedisTemplateStringKeyValueStore(
    private val redis: StringRedisTemplate,
) : StringKeyValueStore {
    override fun get(key: String): String? =
        redis.opsForValue().get(key)

    override fun getAndDelete(key: String): String? =
        redis.opsForValue().getAndDelete(key)

    override fun set(key: String, value: String, ttl: Duration) {
        redis.opsForValue().set(key, value, ttl)
    }

    override fun delete(key: String) {
        redis.delete(key)
    }
}
