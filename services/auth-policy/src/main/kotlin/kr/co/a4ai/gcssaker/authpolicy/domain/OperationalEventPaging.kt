package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Instant
import java.util.Base64

@JvmInline
value class OperationalEventPageLimit(val value: Int) {
    init {
        require(value in MIN_VALUE..MAX_VALUE) { "operational event page limit must be between $MIN_VALUE and $MAX_VALUE" }
    }

    companion object {
        const val MIN_VALUE = 1
        const val MAX_VALUE = 100
        val DEFAULT = OperationalEventPageLimit(50)

        fun from(raw: Int?): OperationalEventPageLimit =
            raw?.coerceIn(MIN_VALUE, MAX_VALUE)?.let(::OperationalEventPageLimit) ?: DEFAULT
    }
}

data class OperationalEventCursor(
    val occurredAt: Instant,
    val id: String,
) {
    init {
        require(id.isNotBlank()) { "operational event cursor id must not be blank" }
    }

    fun encode(): String {
        val raw = "${occurredAt}|$id"
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.toByteArray(Charsets.UTF_8))
    }

    companion object {
        fun decode(raw: String?): OperationalEventCursor? {
            if (raw.isNullOrBlank()) {
                return null
            }
            return runCatching {
                val decoded = String(Base64.getUrlDecoder().decode(raw), Charsets.UTF_8)
                val parts = decoded.split("|", limit = 2)
                require(parts.size == 2)
                OperationalEventCursor(Instant.parse(parts[0]), parts[1])
            }.getOrNull()
        }
    }
}

fun OperationalEventReadModel.toCursor(): OperationalEventCursor =
    OperationalEventCursor(occurredAt = occurredAt, id = id)
