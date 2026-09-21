package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Instant

data class OperationalAlertAcknowledgement(
    val runbookId: String,
    val state: String,
    val updatedBy: String,
    val updatedAt: Instant,
)

interface OperationalAlertAcknowledgementRepository {
    fun save(value: OperationalAlertAcknowledgement): OperationalAlertAcknowledgement
    fun list(): List<OperationalAlertAcknowledgement>
}

