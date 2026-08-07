package kr.co.a4ai.gcssaker.authpolicy.api

import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals

class OperationalApiDocumentationControllerTest {
    private val controller = OperationalApiDocumentationController()

    @Test
    fun `serves admin-only operational swagger without enabling write requests`() {
        val swagger = controller.swagger()
        val initializer = controller.initializer()

        assertEquals("no-store", swagger.headers.cacheControl)
        assertContains(swagger.body.orEmpty(), "noindex,nofollow,noarchive")
        assertContains(initializer.body.orEmpty(), "supportedSubmitMethods: []")
        assertContains(initializer.body.orEmpty(), "persistAuthorization: false")
        assertContains(initializer.body.orEmpty(), "request.headers.Authorization")
        assertContains(initializer.body.orEmpty(), "window.prompt")
    }

    @Test
    fun `serves aggregate OpenAPI contract without embedded credentials`() {
        val response = controller.openApi()
        val body = response.body.orEmpty()

        assertEquals("no-store", response.headers.cacheControl)
        assertContains(body, "openapi: 3.1.0")
        assertContains(body, "/media-control/api/v1/device/publish-sessions:")
        assertContains(body, "/gcs.saker.v1.SakerGatewayService/Exchange:")
        check(!body.contains("gho_"))
        check(!body.contains("@2258703325"))
    }
}
