package kr.co.a4ai.gcssaker.authpolicy.configuration

import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupInvite
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupInvites
import org.springframework.core.env.Environment

private val LOCAL_DEFAULT_PROFILES = setOf("local", "dev", "test")

internal class RuntimeEnvReader(private val env: Environment) {
    fun first(vararg names: String): String? =
        names.asSequence().mapNotNull { env.getProperty(it)?.trim()?.takeIf(String::isNotEmpty) }.firstOrNull()

    fun string(name: String, defaultValue: String): String =
        env.getProperty(name)?.trim()?.takeIf(String::isNotEmpty) ?: defaultValue

    fun long(name: String, defaultValue: Long): Long =
        env.getProperty(name)?.toLongOrNull()?.takeIf { it > 0 } ?: defaultValue

    fun int(name: String, defaultValue: Int): Int =
        env.getProperty(name)?.toIntOrNull()?.takeIf { it > 0 } ?: defaultValue

    fun bool(name: String, defaultValue: Boolean): Boolean =
        env.getProperty(name)?.lowercase()?.let { it == "true" || it == "1" } ?: defaultValue

    fun double(name: String, defaultValue: Double): Double =
        env.getProperty(name)?.toDoubleOrNull()?.takeIf { it >= 0.0 } ?: defaultValue

    fun requiredSecret(names: List<String>, localDefault: String): String =
        names.asSequence()
            .mapNotNull { env.getProperty(it)?.trim()?.takeIf(String::isNotEmpty) }
            .firstOrNull()
            ?: localDefault.takeIf { allowsLocalDefaults() }
            ?: error("Missing required auth-policy secret setting: ${names.joinToString(" or ")}")

    fun allowedOrigins(): AllowedOrigins {
        val configured = csv(AuthRuntimeEnvKeys.AUTH_POLICY_ALLOWED_ORIGINS)
            .ifEmpty { csv(AuthRuntimeEnvKeys.BACKEND_CORS_ALLOW_ORIGINS) }
        return AllowedOrigins.of(configured)
    }

    fun signupInvites(): SignupInvites {
        val raw = env.getProperty(AuthRuntimeEnvKeys.AUTH_POLICY_SIGNUP_INVITES) ?: AuthRuntimeDefaults.SIGNUP_INVITES
        return SignupInvites.of(raw.split(",").map(String::trim).filter(String::isNotEmpty).map(::signupInvite))
    }

    private fun allowsLocalDefaults(): Boolean =
        bool(AuthRuntimeEnvKeys.AUTH_POLICY_ALLOW_LOCAL_DEFAULTS, false) ||
            env.activeProfiles.any { it in LOCAL_DEFAULT_PROFILES }

    private fun csv(name: String): Set<String> =
        env.getProperty(name)?.split(",")?.map(String::trim)?.filter(String::isNotEmpty)?.toSet() ?: emptySet()

    private fun signupInvite(item: String): SignupInvite {
        val parts = item.split(":")
        require(parts.size == 3) {
            "${AuthRuntimeEnvKeys.AUTH_POLICY_SIGNUP_INVITES} must use code:companyId:groupId entries"
        }
        return SignupInvite(parts[0].trim(), parts[1].trim().toInt(), GroupId(parts[2].trim()))
    }
}
