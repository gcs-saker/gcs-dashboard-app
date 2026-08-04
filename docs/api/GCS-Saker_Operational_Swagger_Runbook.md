# GCS-Saker 운영용 Swagger

## 목적

운영 배포의 public edge 계약을 한 곳에서 조회하기 위한 관리자 전용 문서다. REST뿐 아니라
WHIP/WHEP/HLS와 gRPC 경계를 함께 표시한다. DB, Redis, MQTT 관리 포트와 내부 debug/metrics
endpoint는 실행 대상으로 공개하지 않는다.

## 주소

배포 후 다음 URL을 사용한다.

```text
https://a4ai.tplinkdns.com/auth-policy/admin/api-docs/swagger
```

OpenAPI 원문은 다음 관리자 API에서 제공한다.

```text
GET https://a4ai.tplinkdns.com/auth-policy/admin/api-docs/openapi.yaml
Authorization: Bearer <admin-access-token>
```

Swagger HTML과 로컬 정적 asset에는 secret이 없으므로 로딩을 허용하되, UI가 관리자 access token을
메모리로 입력받아 보호된 OpenAPI 원문을 요청한다. OpenAPI endpoint는 Spring Security의
`/admin/**` 정책을 적용하므로 `ADMIN` 권한이 필요하다. 명세와 HTML 응답에는
`Cache-Control: no-store`가 적용된다.

## 운영 안전 설정

- Swagger UI의 `Try it out` 전송 기능은 비활성화되어 있다.
- Swagger UI는 Authorization 값을 영구 저장하지 않는다.
- 관리자 token은 prompt로 메모리에만 받고 URL, cookie, localStorage에 기록하지 않는다.
- 장비 credential, provisioning token, renewal token의 실제 원문 예시는 포함하지 않는다.
- 일회성 secret 응답에는 `no-store`, token schema에는 `writeOnly`를 명시한다.
- 내부 전용 `/policy/devices/authenticate`는 문서에는 경계 확인용으로 표시하지만 public edge는 계속 `404`로 차단한다.
- Prometheus, Actuator 상세 endpoint, DB, Redis, MQTT 관리 endpoint는 Swagger 실행 목록에 넣지 않는다.

대시보드 로그인 access token은 브라우저 저장소에 남기지 않는 구조이므로 Swagger UI에서도 token을
별도로 입력한다. token을 URL query, 브라우저 localStorage 또는 문서 파일에 기록하지 않는다.

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
