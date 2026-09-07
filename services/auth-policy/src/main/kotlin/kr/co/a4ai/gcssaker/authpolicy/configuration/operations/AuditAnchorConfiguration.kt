package kr.co.a4ai.gcssaker.authpolicy.configuration

import com.fasterxml.jackson.databind.ObjectMapper
import kr.co.a4ai.gcssaker.authpolicy.application.AuditAnchorPublisher
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.anchor.FileAuditAnchorWriter
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcAuditChainHeadReader
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import java.nio.charset.StandardCharsets
import java.nio.file.Path
import javax.sql.DataSource

@Configuration
@ConditionalOnProperty(name = ["gcs.audit.anchor.enabled"], havingValue = "true")
class AuditAnchorConfiguration {
    @Bean
    fun auditChainHeadReader(dataSource: DataSource) = JdbcAuditChainHeadReader(dataSource)

    @Bean
    fun auditAnchorWriter(
        mapper: ObjectMapper,
        @Value("\${gcs.audit.anchor.directory}") directory: String,
        @Value("\${gcs.audit.anchor.hmac-key}") hmacKey: String,
        @Value("\${gcs.audit.anchor.source-commit:unknown}") sourceCommit: String,
    ) = FileAuditAnchorWriter(
        Path.of(directory), hmacKey.toByteArray(StandardCharsets.UTF_8), sourceCommit, mapper,
    )

    @Bean
    fun auditAnchorPublisher(reader: JdbcAuditChainHeadReader, writer: FileAuditAnchorWriter) =
        AuditAnchorPublisher(reader, writer)
}
