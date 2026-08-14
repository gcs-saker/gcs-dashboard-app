package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceCredentialIssue
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceRegistryDefaults
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDevice
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceSensor
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceStream

fun RegisteredDevice.toAdminResponse(): RegisteredDeviceResponse =
    RegisteredDeviceResponse(
        deviceUuid = deviceUuid,
        deviceType = deviceType.apiValue,
        groupId = groupId.value,
        displayName = displayName,
        status = status.name.lowercase(),
        sensors = sensors.values.map { it.toResponse() },
        streamPaths = streamPaths.values.map { it.toResponse() },
    )

fun DeviceCredentialIssue.toAdminResponse(): DeviceCredentialIssueResponse =
    DeviceCredentialIssueResponse(
        deviceUuid = device.deviceUuid,
        deviceType = device.deviceType.apiValue,
        credential = credential,
        groupId = device.groupId.value,
        displayName = device.displayName,
        status = device.status.name.lowercase(),
        sensors = device.sensors.values.map { it.toResponse() },
        streamPaths = device.streamPaths.values.map { it.toResponse() },
    )

fun DeviceSensorRequest.toDomain(): RegisteredDeviceSensor =
    RegisteredDeviceSensor(
        sensorId = sensorId,
        sensorType = sensorType,
        status = status ?: DeviceRegistryDefaults.ACTIVE_STATUS,
    )

fun DeviceStreamRequest.toDomain(): RegisteredDeviceStream =
    RegisteredDeviceStream(
        streamPath = streamPath,
        kind = kind ?: DeviceRegistryDefaults.WEBRTC_KIND,
        status = status ?: DeviceRegistryDefaults.ACTIVE_STATUS,
    )

private fun RegisteredDeviceSensor.toResponse(): DeviceSensorResponse =
    DeviceSensorResponse(
        sensorId = sensorId,
        sensorType = sensorType,
        status = status,
    )

private fun RegisteredDeviceStream.toResponse(): DeviceStreamResponse =
    DeviceStreamResponse(
        streamPath = streamPath,
        kind = kind,
        status = status,
    )
