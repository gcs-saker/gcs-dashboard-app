package kr.co.a4ai.gcssaker.authpolicy.api

object GraphQlContextKeys {
    const val AUTHORIZATION_HEADER = AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME
}

object GraphQlApiRoutes {
    const val GRAPHQL = "/graphql"
}

object GraphQlQueryNames {
    const val OPERATIONAL_EVENTS = "operationalEvents"
    const val OPERATIONAL_EVENT_PAGE = "operationalEventPage"
}

object GraphQlSecurityPolicy {
    const val MAX_QUERY_LENGTH = 4096
    const val MAX_QUERY_DEPTH = 6
    const val INTROSPECTION_SCHEMA_FIELD = "__schema"
    const val INTROSPECTION_TYPE_FIELD = "__type"
}

object GraphQlApiErrors {
    const val QUERY_TOO_LARGE = "graphql query is too large"
    const val QUERY_TOO_DEEP = "graphql query is too deep"
    const val INTROSPECTION_DISABLED = "graphql introspection is disabled"
}
