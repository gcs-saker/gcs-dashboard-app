FROM gradle:8.14.3-jdk21@sha256:21bd311ed01360c189b8870c6b6e988199ff10f72d445d02fb39d3cff9da91d7 AS build
WORKDIR /workspace
COPY gradlew gradlew.bat settings.gradle.kts build.gradle.kts ./
COPY gradle ./gradle
COPY src ./src
RUN gradle --no-daemon clean bootJar

FROM eclipse-temurin:21-jre@sha256:273396ed5998598ed1091e8d72711c2d36980a0e65103859c55a4e977a41ffd3
ARG SOURCE_COMMIT=unknown
LABEL org.opencontainers.image.revision=$SOURCE_COMMIT
WORKDIR /app
COPY --from=build /workspace/build/libs/*.jar /app/auth-policy.jar
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /usr/bin/pebble \
    && groupadd --system --gid 10002 gcs \
    && useradd --system --uid 10002 --gid gcs --home /app --shell /usr/sbin/nologin gcs \
    && chown -R gcs:gcs /app
USER 10002:10002
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD sh -c "wget -q -O- http://127.0.0.1:8080/healthz >/dev/null"
ENTRYPOINT ["java", "-jar", "/app/auth-policy.jar"]
