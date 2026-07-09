@ApplicationModule(
    displayName = "Infrastructure Boundary",
    type = ApplicationModule.Type.OPEN,
    allowedDependencies = {"application", "domain"}
)
package kr.co.a4ai.gcssaker.authpolicy.infrastructure;

import org.springframework.modulith.ApplicationModule;
