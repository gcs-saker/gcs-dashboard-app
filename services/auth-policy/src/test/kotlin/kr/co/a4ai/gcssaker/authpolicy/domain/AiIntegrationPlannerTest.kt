package kr.co.a4ai.gcssaker.authpolicy.domain

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AiIntegrationPlannerTest {
    @Test
    fun `application layer AI workloads are Spring AI candidates`() {
        val candidates = listOf(
            AiWorkloadKind.OVERLAY_METADATA_NORMALIZATION,
            AiWorkloadKind.OPERATIONAL_EVENT_SUMMARY,
            AiWorkloadKind.RAG_KNOWLEDGE_QUERY,
            AiWorkloadKind.TOOL_ORCHESTRATION,
        )

        candidates.forEach { workload ->
            val decision = AiIntegrationPlanner.decide(workload)

            assertTrue(decision.springAiCandidate, "$workload should be a Spring AI candidate")
            assertEquals(AiRuntimeBoundary.SPRING_AI_APPLICATION_LAYER, decision.runtimeBoundary)
        }
    }

    @Test
    fun `media and frame critical workloads stay out of Spring AI`() {
        val realtimeInference = AiIntegrationPlanner.decide(AiWorkloadKind.REALTIME_FRAME_INFERENCE)
        val mediaRelay = AiIntegrationPlanner.decide(AiWorkloadKind.MEDIA_RELAY)

        assertFalse(realtimeInference.springAiCandidate)
        assertEquals(AiRuntimeBoundary.EDGE_AI_SIDECAR, realtimeInference.runtimeBoundary)
        assertTrue(realtimeInference.reason.contains("GPU"))

        assertFalse(mediaRelay.springAiCandidate)
        assertEquals(AiRuntimeBoundary.MEDIA_PIPELINE, mediaRelay.runtimeBoundary)
        assertTrue(mediaRelay.reason.contains("media bytes"))
    }
}
