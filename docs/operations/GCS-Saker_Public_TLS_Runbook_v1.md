# 공개 TLS 운영 계약

공개 HTTPS, WSS, gRPC, WHIP endpoint는 `a4ai.tplinkdns.com:443`의 공인 CA 인증서를 사용한다. leaf와 intermediate를 포함한 `fullchain.pem`을 edge에 제공하며 private key는 저장소나 이미지에 포함하지 않는다.

인증서는 ACME client가 host의 private certificate directory에 원자적으로 갱신한다. 갱신 후 `nginx -t`와 reload를 수행하고 `scripts/ops/check_public_tls.sh a4ai.tplinkdns.com 443`으로 chain, hostname, 만료 30일 여유를 검사한다. 실패 시 기존 인증서와 실행 중 edge를 유지한다.

운영 점검은 30일 전 경고를 기본으로 하고 14일, 7일에는 각각 상향 경보한다. Linux OpenSSL/curl, Windows Schannel curl, Android system trust store, grpcurl을 모두 인증서 검증 우회 없이 확인한다. `-k`, `--insecure`, `InsecureSkipVerify`는 운영 장비 설정으로 허용하지 않는다.
