package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.Size

data class LoginRequest(
    val username: String,
    val password: String,
)

data class SignupRequest(
    @field:Size(min = 3, max = 50)
    val username: String,
    @field:Email
    val email: String,
    @field:Size(min = 8, max = 128)
    val password: String,
    val inviteCode: String,
)

data class UserResponse(
    val id: Int,
    val username: String,
    val email: String,
    @get:JsonProperty(AuthApiFields.COMPANY_ID)
    val companyId: Int,
    val role: String,
)

data class TokenResponse(
    @get:JsonProperty(AuthApiFields.ACCESS_TOKEN)
    val accessToken: String,
    @get:JsonProperty(AuthApiFields.TOKEN_TYPE)
    val tokenType: String = AuthTokenContract.BEARER_TOKEN_TYPE,
    @get:JsonProperty(AuthApiFields.EXPIRES_IN_MINUTES)
    val expiresInMinutes: Long,
    val username: String,
    val role: String,
)

data class CurrentUserResponse(
    val username: String,
    val role: String,
)
