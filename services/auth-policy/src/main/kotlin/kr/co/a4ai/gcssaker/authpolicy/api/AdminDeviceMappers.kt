package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceCredentialIssue
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDevice

fun RegisteredDevice.toAdminResponse(): RegisteredDeviceResponse =
    RegisteredDeviceResponse(
        deviceUuid = deviceUuid,
        groupId = groupId.value,
        displayName = displayName,
        status = status.name.lowercase(),
    )

fun DeviceCredentialIssue.toAdminResponse(): DeviceCredentialIssueResponse =
    DeviceCredentialIssueResponse(
        deviceUuid = device.deviceUuid,
        credential = credential,
        groupId = device.groupId.value,
        displayName = device.displayName,
        status = device.status.name.lowercase(),
    )
