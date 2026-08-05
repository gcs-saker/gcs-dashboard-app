# 공개 TLS 및 환경 분리 운영 계약

공개 Android/WebView endpoint는 공인 CA 인증서 체인을 제공해야 한다. 운영 검증에서
`-k`, `--insecure`, `InsecureSkipVerify`를 사용하지 않는다.

## 공개 호스트

| 환경 | origin | upstream |
| --- | --- | --- |
| production canonical | `https://a4ai.121-159-26-245.sslip.io` | Server-01 edge |
| staging | `https://staging-a4ai.121-159-26-245.sslip.io` | Server-02 edge |
| legacy DDNS (비활성) | `a4ai.tplinkdns.com` | 안정적인 권한 DNS 확보 전 사용 금지 |

2026-08-05 전환 중 Let's Encrypt가 `a4ai.tplinkdns.com`의 A와 AAAA 레코드를 조회할 때
권한 DNS 경로에서 `SERVFAIL`을 받았다. 로컬 또는 일부 public resolver의 간헐적 정상 응답만으로는
ACME 신뢰성을 보장할 수 없다. 따라서 이 호스트는 Caddy 자동 인증서 관리와 운영 origin에서 제외한다.
안정적인 사용자 소유 도메인과 권한 DNS를 확보한 뒤, 모든 authoritative name server 및 복수 public
resolver의 응답이 일치하는 것을 확인해야 다시 활성화할 수 있다.

## TLS edge

`deploy/caddy/Caddyfile.tls-alpn-bootstrap`은 Caddy 자동 HTTPS로 인증서를 발급하고 갱신한다.
80번 포트가 외부에서 전달되지 않더라도 443번 TLS-ALPN-01 challenge를 사용할 수 있다. Caddy data
volume은 private 운영 데이터이며 저장소나 이미지에 포함하지 않는다. staging upstream은 Server-02에서
Server-01 주소만 허용하는 LAN 전용 relay를 통과한다.

443 포트 소유자는 하나여야 한다. Caddy를 TLS terminator로 사용할 때 host nginx는
`127.0.0.1:80` application upstream만 제공하며 443을 listen하지 않는다. 전환 전후에
`ss -ltnp 'sport = :443'`과 `docker ps`로 포트 소유자를 확인한다.

환경별 media-control 설정은 다음 origin을 함께 사용한다.

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

인증서 chain, SAN, 30일 이상 잔여 기간, 각 환경 HTTP 200, 보안 헤더를 모두 확인해야 배포를 승인한다.
legacy DDNS 호스트는 공인 인증서 활성화 전까지 연결 실패가 정상인 fail-closed 상태로 유지한다.
