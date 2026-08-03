FROM gradle:8.14.3-jdk21 AS build
WORKDIR /workspace
COPY gradlew gradlew.bat settings.gradle.kts build.gradle.kts ./
COPY gradle ./gradle
COPY src ./src
RUN gradle --no-daemon clean bootJar

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/build/libs/*.jar /app/auth-policy.jar
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD sh -c "wget -q -O- http://127.0.0.1:8080/healthz >/dev/null"
ENTRYPOINT ["java", "-jar", "/app/auth-policy.jar"]
