FROM amazoncorretto:21@sha256:a02f509af88bd1544d5bb42be83a20d9022dc15f388a0007e2c7d0d87170b9f4 AS build
WORKDIR /workspace
COPY gradlew gradlew.bat settings.gradle.kts build.gradle.kts ./
COPY gradle ./gradle
COPY src ./src
COPY --from=contracts /proto /workspace/contracts/proto
ENV CONTRACTS_PROTO_DIR=/workspace/contracts/proto
RUN java -classpath gradle/wrapper/gradle-wrapper.jar org.gradle.wrapper.GradleWrapperMain \
    --no-daemon clean bootJar --stacktrace

FROM amazoncorretto:21-alpine@sha256:600e99e39da14b6a909027a924136c423e9334cb7347a8a77d5908bdaa3011b7
ARG SOURCE_COMMIT=unknown
LABEL org.opencontainers.image.revision=$SOURCE_COMMIT \
      org.opencontainers.image.base.name="amazoncorretto:21-alpine"
WORKDIR /app
COPY --from=build /workspace/build/libs/*.jar /app/auth-policy.jar
RUN apk upgrade --no-cache \
    && addgroup -S -g 10002 gcs \
    && adduser -S -D -H -u 10002 -G gcs -h /app -s /sbin/nologin gcs \
    && mkdir -p /var/lib/gcs-audit-anchor \
    && chown -R gcs:gcs /app /var/lib/gcs-audit-anchor
USER 10002:10002
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD sh -c "wget -q -O- http://127.0.0.1:8080/healthz >/dev/null"
ENTRYPOINT ["java", "-jar", "/app/auth-policy.jar"]
