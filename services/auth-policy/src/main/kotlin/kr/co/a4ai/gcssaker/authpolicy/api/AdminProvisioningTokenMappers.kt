package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceProvisioningTokenIssue
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceProvisioningTokenRecord

fun DeviceProvisioningTokenIssue.toApiResponse(): ProvisioningTokenIssueResponse =
    ProvisioningTokenIssueResponse(
        tokenId = record.tokenId,
        token = token,
        groupId = record.groupId.value,
        label = record.label,
        status = record.status.name.lowercase(),
        maxUses = record.maxUses,
        usedCount = record.usedCount,
        expiresAt = record.expiresAt.toString(),
        createdBy = record.createdBy,
        createdAt = record.createdAt.toString(),
    )

fun DeviceProvisioningTokenRecord.toApiResponse(): ProvisioningTokenRecordResponse =
    ProvisioningTokenRecordResponse(
        tokenId = tokenId,
        groupId = groupId.value,
        label = label,
        status = status.name.lowercase(),
        maxUses = maxUses,
        usedCount = usedCount,
        expiresAt = expiresAt.toString(),
        createdBy = createdBy,
        createdAt = createdAt.toString(),
    )
