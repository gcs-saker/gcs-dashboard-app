package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventMetrics
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventCursor
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventPageLimit
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventPage
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventPageQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventTimeBucket
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.toCursor
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.Timestamp
import javax.sql.DataSource

class JdbcOperationalEventRepository(
    dataSource: DataSource,
    initialEvents: Collection<OperationalEventReadModel>,
) : OperationalEventRepository {
    private val jdbc = JdbcTemplate(dataSource)
    private val writer = JdbcOperationalEventWriter(jdbc)
    private val metricsReader = JdbcOperationalEventMetricsReader(jdbc)

    init {
        OperationalEventSchema.ensure(dataSource)
        writer.seed(initialEvents)
    }

    override fun eventsFor(
        principal: AuthenticatedPrincipal,
        query: OperationalEventQuery,
    ): List<OperationalEventReadModel> {
        val sql = StringBuilder(OperationalEventSql.selectBase)
        val params = mutableListOf<Any>()
        OperationalEventFilterAppender.append(sql, params, principal, query)
        sql.append(OperationalEventSql.orderByOccurredAt)
        return jdbc.query(sql.toString(), JdbcOperationalEventRowMappers.readModel, *params.toTypedArray())
    }

    override fun eventsAfter(
        principal: AuthenticatedPrincipal,
        query: OperationalEventQuery,
        cursor: OperationalEventCursor,
        limit: OperationalEventPageLimit,
    ): List<OperationalEventReadModel> {
        val sql = StringBuilder(OperationalEventSql.selectBase)
        val params = mutableListOf<Any>()
        OperationalEventFilterAppender.append(sql, params, principal, query)
        sql.append(OperationalEventSql.andAfterWatermark)
        params.add(Timestamp.from(cursor.occurredAt))
        params.add(Timestamp.from(cursor.occurredAt))
        params.add(cursor.id)
        sql.append(OperationalEventSql.orderByOccurredAtAscending)
        sql.append(OperationalEventSql.limit)
        params.add(limit.value)
        return jdbc.query(sql.toString(), JdbcOperationalEventRowMappers.readModel, *params.toTypedArray())
    }

    override fun eventPageFor(
        principal: AuthenticatedPrincipal,
        query: OperationalEventPageQuery,
    ): OperationalEventPage {
        val sql = StringBuilder(OperationalEventSql.selectBase)
        val params = mutableListOf<Any>()
        OperationalEventFilterAppender.append(sql, params, principal, query.filter)
        query.after?.let { cursor ->
            sql.append(OperationalEventSql.andAfterCursor)
            params.add(Timestamp.from(cursor.occurredAt))
            params.add(Timestamp.from(cursor.occurredAt))
            params.add(cursor.id)
        }
        sql.append(OperationalEventSql.orderByOccurredAt)
        sql.append(OperationalEventSql.limit)
        params.add(query.limit.value + 1)
        val pageWithExtra = jdbc.query(sql.toString(), JdbcOperationalEventRowMappers.readModel, *params.toTypedArray())
        val events = pageWithExtra.take(query.limit.value)
        return OperationalEventPage(
            events = events,
            nextCursor = events.lastOrNull()?.takeIf { pageWithExtra.size > query.limit.value }?.toCursor(),
        )
    }

    override fun append(event: OperationalEventReadModel) {
        writer.appendIfAbsent(event)
    }

    override fun metricsFor(
        principal: AuthenticatedPrincipal,
        query: OperationalEventQuery,
    ): OperationalEventMetrics = metricsReader.metricsFor(principal, query)

    override fun timeBucketsFor(
        principal: AuthenticatedPrincipal,
        query: OperationalEventQuery,
    ): List<OperationalEventTimeBucket> {
        val sql = StringBuilder(OperationalEventSql.selectTimeBucketsBase)
        val params = mutableListOf<Any>()
        OperationalEventFilterAppender.append(sql, params, principal, query)
        sql.append(OperationalEventSql.groupByTimeBucket)
        return jdbc.query(sql.toString(), JdbcOperationalEventRowMappers.timeBucket, *params.toTypedArray())
    }
}

object OperationalEventSchema {
    fun ensure(dataSource: DataSource) {
        AuthPolicyJdbcMigrations.ensure(dataSource)
    }
}
