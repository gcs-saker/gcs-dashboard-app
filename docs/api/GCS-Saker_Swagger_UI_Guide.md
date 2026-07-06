# GCS-Saker Swagger / OpenAPI Guide

협업자가 API를 빠르게 확인할 수 있도록 단일 OpenAPI 문서를 제공한다.

## 파일

- OpenAPI spec: `docs/api/openapi/gcs-saker-public-api.openapi.json`
- 기준 endpoint catalogue: `docs/architecture/GCS-Saker_M10_endpoint_catalogue.md`

## 로컬에서 Swagger UI로 보기

공개망 개발 환경에서 가장 간단한 방법:

```bash
docker run --rm -p 8090:8080 \
  -e SWAGGER_JSON=/docs/gcs-saker-public-api.openapi.json \
  -v "$PWD/docs/api/openapi:/docs:ro" \
  swaggerapi/swagger-ui
```

브라우저에서 `http://localhost:8090`을 연다.

## 폐쇄망에서 보기

폐쇄망에서는 Docker image를 미리 가져간 뒤 `docker load`로 올리고 같은 명령을 사용한다.

```bash
docker load -i swagger-ui-image.tar
docker run --rm -p 8090:8080 \
  -e SWAGGER_JSON=/docs/gcs-saker-public-api.openapi.json \
  -v "$PWD/docs/api/openapi:/docs:ro" \
  swaggerapi/swagger-ui
```

Docker 사용이 어려운 환경이면 Swagger UI 정적 bundle을 내부 저장소에 두고 `gcs-saker-public-api.openapi.json`만 연결한다.

## 문서 범위

이 OpenAPI 문서는 public edge에서 협업자가 직접 호출할 수 있거나 알아야 하는 HTTP 경로를 다룬다.

- 포함: auth, ops, telemetry, time sync, media-control, WHIP/WHEP, HLS, legacy fallback
- 별도 경계로 설명: gRPC `SakerGatewayService.Exchange`, MQTT topic
- 제외: DB, Redis/DragonFly, MediaMTX admin API, 내부 actuator/metrics 공개

## 중요한 사용 흐름

1. 로그인: `POST /auth-policy/auth/login`
2. stream 목록: `GET /media-control/api/v1/streams`
3. ICE 목록: `GET /media-control/api/v1/streams/ice-servers`
4. 송출: `GET /media-control/api/v1/streams/{streamId}/publish` 후 응답 `whipUrl` 사용
5. 수신: `GET /media-control/api/v1/streams/{streamId}/playback` 후 응답 `playbackUrls.webrtc` 사용
6. HLS fallback: `playbackUrls.hls` 사용

## 보안 주의

- Swagger 예시에 실제 password, refresh token, TURN credential, gateway token을 넣지 않는다.
- `publisherToken`, `playbackToken`은 short-lived media token이며 문서에는 실제 값을 기록하지 않는다.
- Browser dashboard는 gRPC/MQTT에 직접 연결하지 않는다.
- Media frame은 REST, MQTT, gRPC, GraphQL payload로 보내지 않는다.
