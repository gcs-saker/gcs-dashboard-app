package kr.co.a4ai.gcssaker.authpolicy.domain

data class DeviceMetadataDelta<T>(val removed: List<String>, val inserted: List<T>, val updated: List<T>) {
    companion object {
        fun <T> between(current: List<T>, desired: List<T>, identity: (T) -> String): DeviceMetadataDelta<T> {
            val previous = current.associateBy(identity)
            val requested = desired.associateBy(identity)
            if (requested.size != desired.size) {
                throw InvalidContractError("device_metadata_duplicate", "device metadata identities must be unique")
            }
            return DeviceMetadataDelta(
                removed = (previous.keys - requested.keys).sorted(),
                inserted = (requested.keys - previous.keys).sorted().map { requested.getValue(it) },
                updated = (requested.keys intersect previous.keys).sorted()
                    .filter { requested[it] != previous[it] }.map { requested.getValue(it) },
            )
        }
    }
}
