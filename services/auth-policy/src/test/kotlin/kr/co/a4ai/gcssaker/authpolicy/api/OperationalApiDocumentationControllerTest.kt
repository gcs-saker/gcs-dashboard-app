package kr.co.a4ai.gcssaker.authpolicy.api

import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals

class OperationalApiDocumentationControllerTest {
    private val controller = OperationalApiDocumentationController()

    @Test
    fun `serves public operational swagger without enabling write requests`() {
        val swagger = controller.swagger()
        val initializer = controller.initializer()
        val styles = controller.flowStyles()

        assertEquals("no-store", swagger.headers.cacheControl)
        assertContains(swagger.body.orEmpty(), "noindex,nofollow,noarchive")
        assertContains(swagger.body.orEmpty(), "장비 송신")
        assertContains(swagger.body.orEmpty(), "계정 송신")
        assertContains(swagger.body.orEmpty(), "관제 수신")
        assertContains(swagger.body.orEmpty(), "<details>")
        assertContains(swagger.body.orEmpty(), "API 빠른 목록")
        assertContains(swagger.body.orEmpty(), "/auth-policy/auth/login")
        assertContains(swagger.body.orEmpty(), "operations")
        check(!swagger.body.orEmpty().contains("OPERATIONAL_API_CATALOG"))
        assertContains(styles.body.orEmpty(), ".flow-grid")
        assertContains(initializer.body.orEmpty(), "supportedSubmitMethods: []")
        assertContains(initializer.body.orEmpty(), "persistAuthorization: false")
        assertContains(initializer.body.orEmpty(), "url: \"/auth-policy/admin/api-docs/openapi.yaml\"")
        check(!initializer.body.orEmpty().contains("window.prompt"))
        check(!initializer.body.orEmpty().contains("request.headers.Authorization"))
        check(!swagger.body.orEmpty().contains("OpenAPI 명세를 불러오는 중"))
    }

    @Test
    fun `serves aggregate OpenAPI contract without embedded credentials`() {
        val response = controller.openApi()
        val body = response.body.orEmpty()

        assertEquals("no-store", response.headers.cacheControl)
        assertContains(body, "openapi: 3.1.0")
        assertContains(body, "/media-control/api/v1/device/publish-sessions:")
        assertContains(body, "/media-control/api/v1/account/publish-sessions:")
        assertContains(body, "/gcs.saker.v1.SakerGatewayService/Exchange:")
        check(!body.contains("gho_"))
        check(!body.contains("@2258703325"))
    }
}
