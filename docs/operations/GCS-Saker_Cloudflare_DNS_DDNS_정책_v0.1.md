# GCS-Saker Cloudflare DNS/DDNS 정책 v0.1

작성일: 2026-05-26 KST

## 목표

M2 후반 Server-02 staging 및 Server-01 production 후보 배포 전에 dashboard, API, media, TURN 도메인의 역할과 Cloudflare proxy 정책을 분리한다. 실제 domain, origin IP, Cloudflare token, DDNS credential은 이 문서와 GitHub에 기록하지 않는다.

## 기본 원칙

- dashboard와 API는 HTTPS/WSS reverse proxy 경유를 기본으로 한다.
- WebRTC WHEP signaling은 HTTP(S)이므로 Nginx reverse proxy 경유가 가능하다.
- WebRTC ICE UDP/TCP media path, STUN, TURN은 Cloudflare HTTP proxy 대상이 아니다.
- Cloudflare proxy ON은 HTTP(S)/WebSocket 경로에만 사용한다.
- DNS-only는 origin IP가 노출될 수 있으므로 media/TURN처럼 반드시 필요한 경우에만 사용하고 방화벽/source 제한과 함께 운영한다.
- 실제 DNS 적용은 M2 후반 staging/production 후보 배포 시점에 수행한다.

## 도메인 역할

| 역할 | 예시 도메인 | Cloudflare proxy | 대상 | 이유 |
| --- | --- | --- | --- | --- |
| dashboard | `gcs.example.invalid` | ON | Nginx `443/tcp` | 사용자 진입점, HTTPS/WSS, dashboard serving |
| api | `api.gcs.example.invalid` 또는 `/api/` path | ON | Nginx `443/tcp` | HTTP API와 WebSocket API proxy 대상 |
| media | `media.gcs.example.invalid` | DNS-only | Nginx 또는 MediaMTX direct endpoint | WebRTC ICE/direct media 검증 시 Cloudflare HTTP proxy가 UDP/TCP media path를 대신하지 못함 |
| turn | `turn.gcs.example.invalid` | DNS-only | coturn | STUN/TURN UDP/TCP/TLS는 Cloudflare HTTP proxy 대상이 아님 |

## Cloudflare proxy ON 기준

다음 조건을 만족하는 도메인만 proxy ON으로 둔다.

- 브라우저가 HTTP(S) 또는 WebSocket으로 접근한다.
- origin은 Nginx `443/tcp`로 받는다.
- WebRTC ICE candidate가 해당 hostname의 Cloudflare proxy IP를 media endpoint로 사용하지 않는다.
- 장애 시 Cloudflare 캐시/보안 설정을 끄고 origin 직접 검증할 수 있는 절차가 있다.

## DNS-only 기준

다음 도메인은 DNS-only가 기본이다.

- `media.*`: WebRTC direct ICE path, MediaMTX direct 진단, SRT/RTSP ingest 검증에 사용할 수 있는 도메인
- `turn.*`: STUN/TURN/coturn용 도메인
- 서버 운영자가 origin port와 방화벽을 직접 제어해야 하는 도메인

`media.*`를 DNS-only로 두더라도 일반 사용자의 기본 재생 경로는 `gcs.*`의 `/webrtc/`, `/hls/` reverse proxy를 우선 사용한다. direct media 도메인은 staging 진단과 현장 장비 검증에만 제한적으로 사용한다.

## DDNS 갱신 방식

DDNS는 서버 또는 라우터의 공인 IP 변경을 Cloudflare DNS record에 반영하는 절차다. 실제 token과 zone id는 서버 secret 저장소에 둔다.

권장 방식:

1. Cloudflare API token은 DNS edit 범위로 최소화한다.
2. DDNS 대상 record는 staging/prod별로 분리한다.
3. 갱신 스크립트는 변경 전/후 IP와 HTTP status만 운영 로그에 남긴다.
4. 실패 시 마지막 성공 IP와 현재 공인 IP를 비교한다.
5. token, zone id, record id, origin IP 원문은 공개 이슈/PR에 남기지 않는다.

## 장애 확인 명령

아래 명령은 placeholder domain을 실제 운영 도메인으로 바꿔 실행한다.

```bash
dig +short gcs.example.invalid
dig +short api.gcs.example.invalid
dig +short media.gcs.example.invalid
dig +short turn.gcs.example.invalid
```

```bash
curl -I https://gcs.example.invalid/
curl -I https://api.gcs.example.invalid/api/v1/streams/status
curl -I https://gcs.example.invalid/hls/raw/sample/front/index.m3u8
```

```bash
openssl s_client -connect gcs.example.invalid:443 -servername gcs.example.invalid </dev/null
```

```bash
nc -vz media.gcs.example.invalid 8189
nc -vzu media.gcs.example.invalid 8189
```

TURN은 M5 coturn 구성 이후 다음처럼 확인한다.

```bash
turnutils_uclient -u "$TURN_USERNAME" -w "$TURN_PASSWORD" turn.gcs.example.invalid
```

## 배포 전 검증 절차

- [ ] dashboard domain은 Cloudflare proxy ON으로 설정한다.
- [ ] api domain 또는 `/api/` path는 Cloudflare proxy ON으로 설정한다.
- [ ] media domain은 WebRTC direct ICE 또는 ingest 검증에 쓰일 경우 DNS-only로 설정한다.
- [ ] turn domain은 DNS-only로 설정한다.
- [ ] DDNS token, zone id, record id가 GitHub에 저장되지 않았는지 확인한다.
- [ ] `dig +short` 결과가 의도한 Cloudflare proxy 또는 origin 경로와 일치하는지 확인한다.
- [ ] `curl -I`로 dashboard/API/HLS HTTP 경로가 응답하는지 확인한다.
- [ ] WebRTC 실패 시 브라우저 ICE candidate와 Cloudflare proxy ON/DNS-only 설정을 함께 확인한다.
- [ ] 변경 전 DNS record snapshot과 rollback 절차를 남긴다.

## 배포 후 검증 절차

- [ ] 외부 네트워크에서 dashboard HTTPS 접속이 된다.
- [ ] WSS 또는 WebSocket upgrade 경로가 443을 통해 동작한다.
- [ ] playback API가 `https://` URL을 반환하고 mixed content가 발생하지 않는다.
- [ ] WebRTC WHEP signaling이 `https://` 경로에서 응답한다.
- [ ] ICE 연결 실패 시 HLS fallback 또는 TURN 후보로 전환 가능한지 확인한다.
- [ ] DNS 변경 후 TTL 동안 이전 IP가 남아 있을 수 있음을 운영자에게 공지한다.

## known risks

- Cloudflare proxy ON 도메인을 WebRTC ICE media endpoint로 사용하면 브라우저가 Cloudflare edge IP로 ICE 연결을 시도해 실패할 수 있다.
- DNS-only 도메인은 origin 노출 가능성이 있으므로 방화벽과 source 제한을 반드시 함께 적용한다.
- DDNS 갱신 실패는 HTTPS 인증서 문제처럼 보일 수 있으므로 DNS, TLS, Nginx, backend 순서로 분리해 확인한다.
