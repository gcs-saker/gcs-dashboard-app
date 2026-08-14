package kr.co.a4ai.gcssaker.authpolicy.api

import jakarta.servlet.http.HttpServletRequest
import kr.co.a4ai.gcssaker.authpolicy.domain.InvalidContractError
import kr.co.a4ai.gcssaker.authpolicy.domain.PermissionDeniedError
import kr.co.a4ai.gcssaker.authpolicy.domain.PolicyContractError
import kr.co.a4ai.gcssaker.authpolicy.domain.ResourceNotFoundError
import kr.co.a4ai.gcssaker.authpolicy.domain.StateConflictError
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class ApiExceptionHandler(
    private val clientIpResolver: ClientIpResolver = ClientIpResolver(),
) {
    private val logger = LoggerFactory.getLogger("gcs.api.error")

    @ExceptionHandler(PolicyContractError::class)
    fun policyError(error: PolicyContractError, request: HttpServletRequest): ProblemDetail =
        problem(statusFor(error), error.code, error.message ?: "policy request failed", request)

    @ExceptionHandler(ApiError::class)
    fun apiError(error: ApiError, request: HttpServletRequest): ProblemDetail =
        problem(error.statusCode.value(), error.code, error.reason ?: "request failed", request)

    private fun problem(status: Int, code: String, detail: String, request: HttpServletRequest): ProblemDetail {
        logger.warn(
            "api_error code={} status={} method={} path={} correlationId={} remote={}",
            code,
            status,
            request.method,
            ApiPathSanitizer.sanitize(request.requestURI),
            request.getAttribute(RequestTraceContract.CORRELATION_ID_ATTRIBUTE) ?: ApiAccessLogContract.UNKNOWN_VALUE,
            clientIpResolver.resolve(request),
        )
        return ProblemDetail.forStatusAndDetail(HttpStatus.valueOf(status), detail).also {
            it.title = HttpStatus.valueOf(status).reasonPhrase
            it.setProperty("code", code)
            it.setProperty(
                "correlationId",
                request.getAttribute(RequestTraceContract.CORRELATION_ID_ATTRIBUTE)
                    ?: ApiAccessLogContract.UNKNOWN_VALUE,
            )
        }
    }

    private fun statusFor(error: PolicyContractError): Int = when (error) {
        is PermissionDeniedError -> HttpStatus.FORBIDDEN.value()
        is ResourceNotFoundError -> HttpStatus.NOT_FOUND.value()
        is StateConflictError -> HttpStatus.CONFLICT.value()
        is InvalidContractError -> HttpStatus.BAD_REQUEST.value()
    }
}
