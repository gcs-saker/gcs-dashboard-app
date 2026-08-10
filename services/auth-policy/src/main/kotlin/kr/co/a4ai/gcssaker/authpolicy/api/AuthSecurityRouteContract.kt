@file:Suppress("DEPRECATION")

package kr.co.a4ai.gcssaker.authpolicy.api

import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.security.web.util.matcher.AntPathRequestMatcher
import org.springframework.security.web.util.matcher.RequestMatcher

object AuthSecurityRouteContract {
    const val ALL_PATHS = "/**"
    const val ERROR_PATH = "/error"
    const val ERROR_DETAIL_FIELD = "detail"
    const val AUTH_PREFIX = "/auth/**"
    private const val ACTUATOR_HEALTH = "/actuator/health"
    private const val ACTUATOR_INFO = "/actuator/info"
    private const val ACTUATOR_PROMETHEUS = "/actuator/prometheus"
    private const val OPS_PREFIX = "/ops/**"
    private const val TELEMETRY_PREFIX = "/telemetry/**"
    private const val ASSET_PREFIX = "/asset/**"
    private const val ADMIN_PREFIX = "/admin/**"
    private const val ROLE_PREFIX = "ROLE_"
    private const val ADMIN_ROLE_NAME = "ADMIN"

    val CORS_METHODS = listOf(
        HttpMethod.GET.name(),
        HttpMethod.POST.name(),
        HttpMethod.PATCH.name(),
        HttpMethod.OPTIONS.name(),
    )
    val CORS_HEADERS = listOf(
        HttpHeaders.AUTHORIZATION,
        HttpHeaders.CONTENT_TYPE,
        AuthSecurityHeaders.CSRF_HEADER_NAME,
        RequestTraceContract.CORRELATION_ID_HEADER,
        RequestTraceContract.TRACEPARENT_HEADER,
        DeviceTelemetryAuthHeaders.DEVICE_UUID,
        DeviceTelemetryAuthHeaders.DEVICE_CREDENTIAL,
    )
    val PUBLIC_MATCHERS = listOf(
        RouteMatcher(HttpMethod.GET, HealthApiRoutes.HEALTHZ),
        RouteMatcher(HttpMethod.GET, HealthApiRoutes.READYZ),
        RouteMatcher(HttpMethod.GET, ACTUATOR_HEALTH),
        RouteMatcher(HttpMethod.GET, ACTUATOR_INFO),
        RouteMatcher(HttpMethod.GET, ACTUATOR_PROMETHEUS),
        RouteMatcher(
            HttpMethod.GET,
            OperationalApiDocumentationRoutes.ROOT + OperationalApiDocumentationRoutes.SWAGGER,
        ),
        RouteMatcher(
            HttpMethod.GET,
            OperationalApiDocumentationRoutes.ROOT + OperationalApiDocumentationRoutes.INITIALIZER,
        ),
        RouteMatcher(
            HttpMethod.GET,
            OperationalApiDocumentationRoutes.ROOT + OperationalApiDocumentationRoutes.FLOW_STYLES,
        ),
        RouteMatcher(HttpMethod.GET, "/webjars/swagger-ui/**"),
        RouteMatcher(HttpMethod.OPTIONS, ALL_PATHS),
        RouteMatcher(null, ERROR_PATH),
        RouteMatcher(null, AUTH_PREFIX),
        RouteMatcher(HttpMethod.POST, AuthApiRoutes.ROOT + AuthApiRoutes.SIGNUP),
        RouteMatcher(HttpMethod.POST, AuthApiRoutes.ROOT + AuthApiRoutes.LOGIN),
        RouteMatcher(HttpMethod.POST, AuthApiRoutes.ROOT + AuthApiRoutes.REFRESH),
        RouteMatcher(HttpMethod.POST, AuthApiRoutes.ROOT + AuthApiRoutes.LOGOUT),
        RouteMatcher(HttpMethod.POST, DevicePolicyApiRoutes.ROOT + DevicePolicyApiRoutes.PUBLISH),
        RouteMatcher(HttpMethod.POST, DevicePolicyApiRoutes.ROOT + DevicePolicyApiRoutes.AUTHENTICATE),
        RouteMatcher(HttpMethod.POST, DeviceBootstrapApiRoutes.ROOT + DeviceBootstrapApiRoutes.REGISTER),
        RouteMatcher(HttpMethod.POST, DeviceBootstrapApiRoutes.EDGE_ROOT + DeviceBootstrapApiRoutes.REGISTER),
        RouteMatcher(HttpMethod.POST, "/api/v1/devices/*/telemetry"),
    )
    val ADMIN_MATCHERS = listOf(RouteMatcher(null, ADMIN_PREFIX))
    val ADMIN_AUTHORITY = roleAuthority(ADMIN_ROLE_NAME)
    val PROTECTED_MATCHERS = listOf(
        RouteMatcher(HttpMethod.GET, AuthApiRoutes.ROOT + AuthApiRoutes.ME),
        RouteMatcher(null, AccountPublisherPolicyApiRoutes.ROOT + ALL_PATHS),
        RouteMatcher(null, StreamPolicyApiRoutes.ROOT + ALL_PATHS),
        RouteMatcher(null, OPS_PREFIX),
        RouteMatcher(null, TELEMETRY_PREFIX),
        RouteMatcher(null, ASSET_PREFIX),
        RouteMatcher(null, GraphQlApiRoutes.GRAPHQL),
    )

    fun roleAuthority(roleName: String): String = ROLE_PREFIX + roleName.uppercase()
}

data class RouteMatcher(
    val method: HttpMethod?,
    val pattern: String,
) {
    fun toRequestMatcher(): RequestMatcher =
        if (method == null) {
            AntPathRequestMatcher(pattern)
        } else {
            AntPathRequestMatcher(pattern, method.name())
        }
}
