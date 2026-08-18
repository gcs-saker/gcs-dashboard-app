FROM gradle:8.14.3-jdk21@sha256:21bd311ed01360c189b8870c6b6e988199ff10f72d445d02fb39d3cff9da91d7 AS build
WORKDIR /workspace
COPY gradlew gradlew.bat settings.gradle.kts build.gradle.kts ./
COPY gradle ./gradle
COPY src ./src
RUN gradle --no-daemon clean bootJar

FROM bellsoft/liberica-runtime-container@sha256:9f40ba2e62588e78433db1faddaf0e3bf712edf12fc8837c4ef9df652a01896d
ARG SOURCE_COMMIT=unknown
LABEL org.opencontainers.image.revision=$SOURCE_COMMIT
WORKDIR /app
COPY --from=build /workspace/build/libs/*.jar /app/auth-policy.jar
RUN addgroup -S -g 10002 gcs \
    && adduser -S -D -H -u 10002 -G gcs -s /sbin/nologin gcs \
    && chown -R gcs:gcs /app
USER 10002:10002
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD sh -c "wget -q -O- http://127.0.0.1:8080/healthz >/dev/null"
ENTRYPOINT ["java", "-jar", "/app/auth-policy.jar"]
