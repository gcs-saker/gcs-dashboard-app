package kr.co.a4ai.gcssaker.authpolicy.configuration

import kr.co.a4ai.gcssaker.authpolicy.domain.AdminMfaVerifier
import kr.co.a4ai.gcssaker.authpolicy.domain.MfaDisabled
import kr.co.a4ai.gcssaker.authpolicy.domain.TotpAdminMfaVerifier
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcRecoveryCodeStore
import org.springframework.beans.factory.ObjectProvider
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import javax.sql.DataSource

@Configuration
class AdminMfaConfiguration {
    @Bean
    fun adminMfaVerifier(env: Environment, dataSources: ObjectProvider<DataSource>): AdminMfaVerifier {
        if (!env.getProperty("AUTH_POLICY_ADMIN_MFA_REQUIRED", Boolean::class.java, false)) return MfaDisabled
        val dataSource = dataSources.ifAvailable ?: error("admin MFA requires durable recovery-code storage")
        val secret = env.getRequiredProperty("AUTH_POLICY_ADMIN_MFA_SECRET")
        val hashes = env.getRequiredProperty("AUTH_POLICY_ADMIN_MFA_RECOVERY_HASHES")
            .split(',').map(String::trim).filter(String::isNotEmpty).toSet()
        return TotpAdminMfaVerifier(secret, hashes, JdbcRecoveryCodeStore(dataSource))
    }
}
