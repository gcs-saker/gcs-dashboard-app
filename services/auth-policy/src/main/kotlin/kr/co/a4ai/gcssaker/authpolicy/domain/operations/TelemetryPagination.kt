package kr.co.a4ai.gcssaker.authpolicy.domain

object TelemetryPageLimits {
    const val DEFAULT_SIZE = 100
    const val MAX_SIZE = 500
    const val MAX_CURSOR_LENGTH = 2048
    const val MAX_UUID_LENGTH = 128
    const val CURSOR_TTL_SECONDS = 600L
    const val CURSOR_PURPOSE = "telemetry-page-v1"
}

@JvmInline
value class TelemetryPageSize(val value: Int) {
    init {
        if (value !in 1..TelemetryPageLimits.MAX_SIZE) {
            throw InvalidContractError("telemetry_page_size_invalid", "page size is outside the allowed range")
        }
    }
    val fetchLimit: Int get() = value + 1
}

data class TelemetryPageQuery(val size: TelemetryPageSize, val afterUuid: String? = null) {
    init {
        if (afterUuid != null && (afterUuid.isBlank() || afterUuid.length > TelemetryPageLimits.MAX_UUID_LENGTH)) {
            throw InvalidContractError("telemetry_page_position_invalid", "page position is invalid")
        }
    }
}

data class TelemetryPageCommand(val size: TelemetryPageSize, val cursor: String?)
data class TelemetryPage(val items: List<TelemetryReadModel>, val nextCursor: String?)

interface TelemetryCursorCodec {
    fun encode(principal: AuthenticatedPrincipal, afterUuid: String): String
    fun decode(principal: AuthenticatedPrincipal, cursor: String): String
}

class TelemetryPageUnavailableError(cause: Throwable) : RuntimeException("telemetry page is unavailable", cause)
