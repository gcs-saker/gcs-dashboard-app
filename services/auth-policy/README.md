# GCS-Saker Auth Policy Service

Spring Boot + Kotlin 기반 인증/인가 및 group policy control-plane PoC 서비스다.

## 역할

- JWT access token claim 모델 검증
- 사용자 role과 group scope 기반 stream 접근 정책 검증
- 장기적으로 refresh session, device identity, TURN credential 발급 위치를 담당

## 원칙

- 기존 FastAPI auth를 바로 대체하지 않는다.
- 폐쇄망에서도 외부 identity provider 없이 동작할 수 있어야 한다.
- DTO/VO와 domain service를 분리한다.
- group hierarchy와 stream routing policy는 테스트 가능한 domain model로 먼저 만든다.

## 테스트

```bash
./gradlew test jacocoTestReport
```

Gradle wrapper는 `8.14.3`으로 고정한다. 폐쇄망 납품 전에는 Gradle distribution, Maven dependency cache, Docker image tarball을 함께 패키징해야 한다.
