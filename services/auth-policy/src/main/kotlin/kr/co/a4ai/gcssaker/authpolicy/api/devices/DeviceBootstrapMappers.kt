package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceCredentialIssue
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceSensor
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceStream

fun DeviceCredentialIssue.toBootstrapResponse(): DeviceBootstrapResponse =
    DeviceBootstrapResponse(
        deviceUuid = device.deviceUuid,
        deviceType = device.deviceType.apiValue,
        credential = credential,
        displayName = device.displayName,
        status = device.status.name.lowercase(),
        sensors = device.sensors.values.map { it.toBootstrapResponse() },
        streamPaths = device.streamPaths.values.map { it.toBootstrapResponse() },
    )

private fun RegisteredDeviceSensor.toBootstrapResponse(): DeviceSensorResponse =
    DeviceSensorResponse(
        sensorId = sensorId,
        sensorType = sensorType,
        status = status,
    )

private fun RegisteredDeviceStream.toBootstrapResponse(): DeviceStreamResponse =
    DeviceStreamResponse(
        streamPath = streamPath,
        kind = kind,
        status = status,
    )
