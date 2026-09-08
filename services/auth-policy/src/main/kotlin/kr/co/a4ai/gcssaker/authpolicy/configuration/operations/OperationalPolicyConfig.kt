package kr.co.a4ai.gcssaker.authpolicy.configuration

import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.annotation.EnableScheduling

/** Enables scheduling for operational policy jobs; feature beans live in focused configurations. */
@Configuration
@EnableScheduling
class OperationalPolicyConfig
