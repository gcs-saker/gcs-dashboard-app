package kr.co.a4ai.gcssaker.authpolicy.domain

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class DeviceMetadataDeltaTest {
    @Test
    fun `empty and reordered unchanged snapshots produce no writes`() {
        assertEquals(DeviceMetadataDelta<String>(emptyList(), emptyList(), emptyList()),
            DeviceMetadataDelta.between(emptyList(), emptyList(), { it: String -> it }))
        val sensors = listOf(RegisteredDeviceSensor("b", "gps"), RegisteredDeviceSensor("a", "camera"))
        val delta = DeviceMetadataDelta.between(sensors, sensors.reversed(), RegisteredDeviceSensor::sensorId)
        assertTrue(delta.removed.isEmpty() && delta.inserted.isEmpty() && delta.updated.isEmpty())
    }

    @Test
    fun `only changed inserted and removed identities are returned deterministically`() {
        val current = listOf(RegisteredDeviceSensor("remove", "gps"), RegisteredDeviceSensor("update", "camera"))
        val desired = listOf(RegisteredDeviceSensor("new", "gps"), RegisteredDeviceSensor("update", "camera", "inactive"))
        val delta = DeviceMetadataDelta.between(current, desired, RegisteredDeviceSensor::sensorId)
        assertEquals(listOf("remove"), delta.removed)
        assertEquals(listOf(desired.first()), delta.inserted)
        assertEquals(listOf(desired.last()), delta.updated)
    }

    @Test
    fun `removing the last identity is explicit and duplicates are not silently collapsed`() {
        val stream = RegisteredDeviceStream("fixture-path")
        val removed = DeviceMetadataDelta.between(listOf(stream), emptyList(), RegisteredDeviceStream::streamPath)
        assertEquals(listOf(stream.streamPath), removed.removed)
        assertEquals("device_metadata_duplicate", assertThrows<InvalidContractError> {
            DeviceMetadataDelta.between(emptyList(), listOf(stream, stream.copy(kind = "hls")), RegisteredDeviceStream::streamPath)
        }.code)
    }
}
