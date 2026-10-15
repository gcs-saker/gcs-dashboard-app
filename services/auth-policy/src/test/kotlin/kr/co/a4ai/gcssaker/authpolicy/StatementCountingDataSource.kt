package kr.co.a4ai.gcssaker.authpolicy

import org.springframework.jdbc.datasource.AbstractDataSource
import java.lang.reflect.InvocationTargetException
import java.lang.reflect.Proxy
import java.sql.Connection
import java.util.concurrent.atomic.AtomicInteger
import javax.sql.DataSource

internal class StatementCountingDataSource(private val delegate: DataSource) : AbstractDataSource() {
    val selects = AtomicInteger()
    override fun getConnection(): Connection = counted(delegate.connection)
    override fun getConnection(username: String?, password: String?): Connection = counted(delegate.getConnection(username, password))

    private fun counted(connection: Connection): Connection = Proxy.newProxyInstance(
        Connection::class.java.classLoader, arrayOf(Connection::class.java),
    ) { _, method, arguments ->
        if (method.name == "prepareStatement" && (arguments?.firstOrNull() as? String)?.trimStart()?.startsWith("SELECT", true) == true) {
            selects.incrementAndGet()
        }
        try {
            method.invoke(connection, *(arguments ?: emptyArray()))
        } catch (error: InvocationTargetException) {
            throw error.targetException
        }
    } as Connection
}
