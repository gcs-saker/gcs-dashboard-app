package kr.co.a4ai.gcssaker.authpolicy.domain

enum class AiWorkloadKind {
    REALTIME_FRAME_INFERENCE,
    OVERLAY_METADATA_NORMALIZATION,
    OPERATIONAL_EVENT_SUMMARY,
    RAG_KNOWLEDGE_QUERY,
    TOOL_ORCHESTRATION,
    MEDIA_RELAY,
}

enum class AiRuntimeBoundary {
    EDGE_AI_SIDECAR,
    SPRING_AI_APPLICATION_LAYER,
    MEDIA_PIPELINE,
}

data class AiIntegrationDecision(
    val workload: AiWorkloadKind,
    val runtimeBoundary: AiRuntimeBoundary,
    val springAiCandidate: Boolean,
    val reason: String,
)

object AiIntegrationPlanner {
    fun decide(workload: AiWorkloadKind): AiIntegrationDecision =
        when (workload) {
            AiWorkloadKind.REALTIME_FRAME_INFERENCE -> edgeSidecar(
                workload,
                "video frame inference must stay close to the decoder or GPU edge pipeline",
            )
            AiWorkloadKind.OVERLAY_METADATA_NORMALIZATION -> springAiCandidate(
                workload,
                "typed overlay metadata can be normalized and explained at the application layer",
            )
            AiWorkloadKind.OPERATIONAL_EVENT_SUMMARY -> springAiCandidate(
                workload,
                "operational events are already policy-owned data and can use structured AI output",
            )
            AiWorkloadKind.RAG_KNOWLEDGE_QUERY -> springAiCandidate(
                workload,
                "operator guide and incident knowledge retrieval fits Spring AI RAG boundaries",
            )
            AiWorkloadKind.TOOL_ORCHESTRATION -> springAiCandidate(
                workload,
                "tool calls should execute through server-owned application services",
            )
            AiWorkloadKind.MEDIA_RELAY -> mediaPipeline(
                workload,
                "media bytes must not be routed through AI orchestration",
            )
        }

    private fun springAiCandidate(workload: AiWorkloadKind, reason: String) =
        AiIntegrationDecision(
            workload = workload,
            runtimeBoundary = AiRuntimeBoundary.SPRING_AI_APPLICATION_LAYER,
            springAiCandidate = true,
            reason = reason,
        )

    private fun edgeSidecar(workload: AiWorkloadKind, reason: String) =
        AiIntegrationDecision(
            workload = workload,
            runtimeBoundary = AiRuntimeBoundary.EDGE_AI_SIDECAR,
            springAiCandidate = false,
            reason = reason,
        )

    private fun mediaPipeline(workload: AiWorkloadKind, reason: String) =
        AiIntegrationDecision(
            workload = workload,
            runtimeBoundary = AiRuntimeBoundary.MEDIA_PIPELINE,
            springAiCandidate = false,
            reason = reason,
        )
}
