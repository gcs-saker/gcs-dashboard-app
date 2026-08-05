# 공개 TLS 및 환경 분리 운영 계약

공개 Android/WebView endpoint는 공인 CA 신뢰 체인을 제공해야 하며 `-k`, `--insecure`, `InsecureSkipVerify`를 운영 검증에 사용하지 않는다.

## 공개 호스트

| 환경 | origin | upstream |
| --- | --- | --- |
| production | `https://a4ai.121-159-26-245.sslip.io` | Server-01 edge |
| staging | `https://staging-a4ai.121-159-26-245.sslip.io` | Server-02 edge |

TP-Link DDNS의 권한 DNS가 ACME CA에서 `SERVFAIL` 또는 `NXDOMAIN`을 반환할 수 있어 인증서 호스트로 사용하지 않는다. 두 환경은 서로 다른 SNI host와 media-control expected-origin 계약을 사용한다.

기존 PC 클라이언트의 `a4ai.tplinkdns.com` 호스트는 호환 라우트로 유지한다. 신규 Android 클라이언트와 API 응답은 공인 인증서가 적용된 위 origin만 사용한다.

## TLS edge

`deploy/caddy/Caddyfile.tls-alpn-bootstrap`은 외부 80번 포트가 없는 환경에서 TLS-ALPN-01로 인증서를 발급·자동 갱신한다. Caddy data volume은 private 운영 데이터이며 저장소나 이미지에 포함하지 않는다. staging upstream은 Server-02에서 Server-01 주소만 허용하는 LAN 전용 relay를 통과한다.

443 포트의 소유자는 반드시 하나여야 한다. Caddy를 TLS terminator로 사용할 때 host nginx는
`127.0.0.1:80` application upstream만 제공하고 443을 listen하지 않는다. Caddy와 nginx가 동시에
443을 점유하도록 실행하면 Caddy가 restart loop에 들어가고 기존 self-signed 인증서가 계속 노출된다.
전환 전 `ss -ltnp 'sport = :443'`과 `docker ps`로 현재 소유자를 확인하고, Caddy가 정상 인증서를
제공한 뒤에만 기존 TLS virtual host를 제거한다. 인증서 발급 실패 시 기존 구성을 복원한다.

환경별 media-control 설정은 다음 값을 함께 사용한다.

```dotenv
# production
MEDIA_CONTROL_PUBLIC_WEBRTC_BASE_URL=https://a4ai.121-159-26-245.sslip.io/webrtc
MEDIA_CONTROL_PUBLIC_HLS_BASE_URL=https://a4ai.121-159-26-245.sslip.io/hls
MEDIA_CONTROL_EXPECTED_PUBLIC_ORIGIN=https://a4ai.121-159-26-245.sslip.io

# staging
MEDIA_CONTROL_PUBLIC_WEBRTC_BASE_URL=https://staging-a4ai.121-159-26-245.sslip.io/webrtc
MEDIA_CONTROL_PUBLIC_HLS_BASE_URL=https://staging-a4ai.121-159-26-245.sslip.io/hls
MEDIA_CONTROL_EXPECTED_PUBLIC_ORIGIN=https://staging-a4ai.121-159-26-245.sslip.io
```

`MEDIA_CONTROL_EXPECTED_PUBLIC_ORIGIN`과 실제 WebRTC/HLS origin이 다르면 media-control은 시작하지 않는다.

## 검증

```bash
scripts/ops/check_public_tls.sh a4ai.121-159-26-245.sslip.io 443
scripts/ops/check_public_tls.sh staging-a4ai.121-159-26-245.sslip.io 443
curl -fsS https://a4ai.121-159-26-245.sslip.io/ >/dev/null
curl -fsS https://staging-a4ai.121-159-26-245.sslip.io/ >/dev/null
```

인증서 chain, SAN, 30일 이상 잔여 기간, 양 환경 HTTP 200을 모두 통과해야 배포를 승인한다.
