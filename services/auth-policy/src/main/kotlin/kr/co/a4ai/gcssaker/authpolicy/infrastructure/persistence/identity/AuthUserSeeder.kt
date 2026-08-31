package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUserRepository

class AuthUserSeeder {
    fun synchronize(repository: AuthUserRepository, configuredUsers: Collection<AuthUser>) {
        configuredUsers.forEach { configured ->
            val byUsername = repository.findByUsername(configured.username)
            when {
                byUsername != null -> repository.update(configured.copy(id = byUsername.id))
                repository.findByEmail(configured.email) == null -> repository.save(configured)
            }
        }
    }
}
