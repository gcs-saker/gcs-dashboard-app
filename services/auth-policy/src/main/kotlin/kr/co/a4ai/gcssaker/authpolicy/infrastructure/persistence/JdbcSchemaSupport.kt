package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import org.springframework.jdbc.core.ConnectionCallback
import org.springframework.jdbc.core.JdbcTemplate

internal data class JdbcIndexDefinition(
    val name: String,
    val table: String,
    val columns: List<String>,
) {
    val createSql: String =
        "CREATE INDEX $name ON $table (${columns.joinToString(JdbcSchemaContract.COLUMN_SEPARATOR)})"
}

internal object JdbcSchemaContract {
    const val COLUMN_SEPARATOR = ", "
}

internal fun JdbcTemplate.createIndexIfMissing(index: JdbcIndexDefinition) {
    val exists = execute(
        ConnectionCallback { connection ->
            val schemas = listOf(connection.schema, null).distinct()
            val tables = listOf(index.table, index.table.uppercase()).distinct()
            for (schema in schemas) {
                for (table in tables) {
                    connection.metaData
                        .getIndexInfo(connection.catalog, schema, table, false, false)
                        .use { resultSet ->
                            while (resultSet.next()) {
                                if (resultSet.getString(JdbcIndexMetadataColumns.indexName).equals(index.name, ignoreCase = true)) {
                                    return@ConnectionCallback true
                                }
                            }
                        }
                }
            }
            false
        },
    ) ?: false

    if (!exists) {
        execute(index.createSql)
    }
}

private object JdbcIndexMetadataColumns {
    const val indexName = "INDEX_NAME"
}
