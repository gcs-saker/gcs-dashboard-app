package kr.co.a4ai.gcssaker.authpolicy.configuration

import kr.co.a4ai.gcssaker.authpolicy.domain.GeofenceRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.GeofenceTelemetryEvaluator
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryGeofenceRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryAlertRuleEngine
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcGeofenceRepository
import org.springframework.beans.factory.ObjectProvider
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import javax.sql.DataSource

@Configuration
class GeofencePolicyConfiguration {
    @Bean
    fun geofenceRepository(
        settings: AuthRuntimeSettings,
        dataSource: ObjectProvider<DataSource>,
    ): GeofenceRepository =
        PersistenceMode.dataSource(settings, dataSource)?.let(::JdbcGeofenceRepository)
            ?: InMemoryGeofenceRepository()

    @Bean
    fun geofenceTelemetryEvaluator(
        geofences: GeofenceRepository,
        events: OperationalEventRepository,
    ): GeofenceTelemetryEvaluator = GeofenceTelemetryEvaluator(geofences, events)

    @Bean
    fun telemetryAlertRuleEngine(events: OperationalEventRepository): TelemetryAlertRuleEngine =
        TelemetryAlertRuleEngine(events)
}
