# GCS-Saker 운영용 Swagger

## 목적

운영 배포의 public edge 계약을 한 곳에서 조회하기 위한 관리자 전용 문서다. REST뿐 아니라
WHIP/WHEP/HLS와 gRPC 경계를 함께 표시한다. DB, Redis, MQTT 관리 포트와 내부 debug/metrics
endpoint는 실행 대상으로 공개하지 않는다.

## 접근 경계

운영 public edge에서는 문서와 명세를 제공하지 않는다. 다음 경로는 모두 `404`다.

```text
/ops/swagger
/ops/openapi.yaml
/auth-policy/admin/api-docs/*
/auth-policy/webjars/swagger-ui/*
```

문서 산출물은 auth-policy 컨테이너 내부에서만 확인한다.

```text
GET http://auth-policy:8080/admin/api-docs/swagger
GET http://auth-policy:8080/admin/api-docs/openapi.yaml
```

운영 호스트에서 원문을 점검할 때는 public 포트를 만들지 않고 컨테이너 내부 명령을 사용한다.

```bash
docker compose -f deploy/compose/compose.single-node.poc.yml \
  exec -T auth-policy wget -qO- http://127.0.0.1:8080/admin/api-docs/openapi.yaml
```

임시 host port 공개나 public reverse-proxy 예외를 만들지 않는다. 브라우저 UI가 반드시 필요하면
별도 관리망 프록시와 인증 정책을 먼저 승인받아야 한다. 명세와 HTML 응답에는
`Cache-Control: no-store`가 적용된다.

## 운영 안전 설정

- Swagger UI의 `Try it out` 전송 기능은 비활성화되어 있다.
- Swagger UI는 Authorization 값을 영구 저장하지 않는다.
- 문서 조회를 위해 관리자 token이나 운영 credential을 URL에 기록하지 않는다.
- 장비 credential, provisioning token, renewal token의 실제 원문 예시는 포함하지 않는다.
- 일회성 secret 응답에는 `no-store`, token schema에는 `writeOnly`를 명시한다.
- 내부 전용 `/policy/devices/authenticate`는 문서에는 경계 확인용으로 표시하지만 public edge는 계속 `404`로 차단한다.
- Prometheus, Actuator 상세 endpoint, DB, Redis, MQTT 관리 endpoint는 Swagger 실행 목록에 넣지 않는다.

대시보드 로그인 access token을 문서 도구에 복사하지 않는다. token을 URL query, 브라우저
localStorage 또는 문서 파일에 기록하지 않는다.

## 검증

OpenAPI 3.1 validation:

```bash
python -m openapi_spec_validator \
  services/auth-policy/src/main/resources/openapi/gcs-saker-operations.openapi.yaml
```

계약 회귀 테스트:

```bash
pytest backend/tests/test_operational_openapi_contract.py
cd services/auth-policy && ./gradlew test --tests '*OperationalApiDocumentationControllerTest'
```

API를 추가하거나 제거할 때는 controller/router, nginx edge route, OpenAPI 명세와 계약 테스트를
같은 변경에서 수정한다.
