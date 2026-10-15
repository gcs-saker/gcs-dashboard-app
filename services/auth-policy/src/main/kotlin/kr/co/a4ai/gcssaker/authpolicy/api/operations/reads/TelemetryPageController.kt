package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.application.TelemetryPageService
import kr.co.a4ai.gcssaker.authpolicy.domain.*
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.util.MultiValueMap
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
class TelemetryPageController(private val pages: TelemetryPageService) {
    @GetMapping(OperationalReadApiRoutes.TELEMETRY_PAGE)
    @RequiresBearerAuth
    fun page(
        @AuthenticationPrincipal principal: AuthenticatedPrincipal?,
        @RequestParam parameters: MultiValueMap<String, String>,
    ): ResponseEntity<TelemetryPageResponse> {
        val subject = principal ?: throw UnauthorizedApiError(AuthApiErrors.AUTHENTICATION_REQUIRED)
        val request = TelemetryPageParameters.parse(parameters)
        val page = pages.readPage(subject, request.toCommand())
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(
            TelemetryPageResponse(page.items.map { it.toResponse() }, page.nextCursor),
        )
    }
}

data class TelemetryPageResponse(val items: List<TelemetryReadResponse>, val nextCursor: String?)

internal data class TelemetryPageParameters(val limit: Int, val cursor: String?) {
    fun toCommand() = TelemetryPageCommand(TelemetryPageSize(limit), cursor)

    companion object {
        fun parse(parameters: MultiValueMap<String, String>): TelemetryPageParameters {
            if (parameters.keys.any { it !in ALLOWED_PARAMETERS } || parameters.values.any { it.size != 1 }) invalid()
            val rawLimit = parameters.getFirst(LIMIT)
            val size = if (rawLimit == null) TelemetryPageLimits.DEFAULT_SIZE else rawLimit.toIntOrNull() ?: invalid()
            val cursor = parameters.getFirst(CURSOR)
            if (cursor != null && (cursor.isBlank() || cursor.length > TelemetryPageLimits.MAX_CURSOR_LENGTH)) invalid()
            return TelemetryPageParameters(size, cursor)
        }
        private fun invalid(): Nothing = throw BadRequestApiError("pagination parameters are invalid", "telemetry_page_query_invalid")
        private const val LIMIT = "limit"
        private const val CURSOR = "cursor"
        private val ALLOWED_PARAMETERS = setOf(LIMIT, CURSOR)
    }
}
