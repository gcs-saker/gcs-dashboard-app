# NGINX and Java critical security update evidence — 2026-11-20

## Scope

Source-only and disposable-Docker verification for the GCS-Saker dashboard, edge, and auth-policy images. Server-01
deployment and physical mobile validation were not run.

## Advisory comparison

- The checked-in dashboard image ran NGINX 1.29.8. NGINX 1.31.8 and earlier mainline releases are affected by the
  NGINX2Root family, including CVE-2026-123007. NGINX 1.31.9 is the patched mainline release.
- The checked-in auth-policy runtime ran Corretto 21.0.12.8.1 and its build image ran Temurin 21.0.9. The November
  Java CPU requires a vendor-fixed Java 21 build; Amazon Corretto 21.0.13.1.2 includes the Java 21 fixes.
- The auth-policy JAR also contained Tomcat 10.1.59. Current scanner evidence required at least 10.1.61, while the
  current released 10.1 security patch is 10.1.62. The application does not configure Tomcat clustering or TLS-PSK.

Primary references:

- https://github.com/nginx/nginx/releases/tag/release-1.31.9
- https://www.boho.or.kr/kr/bbs/view.do?bbsId=B0000133&nttId=72313&menuNo=205020
- https://github.com/corretto/corretto-21/blob/develop/CHANGELOG.md
- https://tomcat.apache.org/security-10.html

## Accepted changes

- Dashboard and local helper NGINX: 1.31.9 with immutable image digests.
- Production edge base: NGINX unprivileged 1.31.9 from the current upstream GHCR registry.
- Production edge is now an owned hardened image that upgrades Alpine security packages, returns to UID/GID 101,
  enters the signed release manifest, receives an SBOM/provenance/signature, and is vulnerability-scanned in CI.
- Auth-policy build and runtime: Corretto 21.0.13.1.2 using separate immutable glibc and Alpine images.
- Gradle 8.14.3 is downloaded by the wrapper with an authoritative SHA-256 checksum rather than inherited from an
  outdated JDK build image.
- Embedded Tomcat: 10.1.62.

## Rejected intermediate results

- Corretto Alpine could not execute the glibc gRPC protoc plug-in. It was rejected as a build image.
- The glibc Corretto image initially lacked `xargs`. The final build invokes the checksum-verifying Gradle Wrapper
  JAR directly, so no additional OS package is installed.
- The raw NGINX unprivileged 1.31.9 image still contained fix-available Alpine OpenSSL and zlib findings. Direct use
  was rejected and replaced by the hardened edge image.
- A test run against the Docker build context reported `NO-SOURCE` because production `.dockerignore` excludes test
  sources. That result was discarded; the actual repository test tree was mounted read-only for the accepted runs.
- Edge HTTP checks with incomplete mock upstream ports returned 502 and were discarded. Accepted runs used the
  patched dashboard on port 3000 and the repository health placeholder on port 8080.

## Accepted Docker evidence

- Dashboard image build: PASS; npm audit reported zero vulnerabilities.
- Auth-policy image build with protobuf/gRPC generation and boot JAR creation: PASS.
- Hardened edge image build and NGINX version check: PASS, 1.31.9.
- Grype fix-available HIGH gate: PASS for dashboard, auth-policy, and hardened edge; no findings.
- Dashboard non-root/read-only/capability-free startup and HTTP response: PASS, 3/3 cycles.
- Production edge configuration check plus non-root/read-only/capability-free proxied health: PASS, 3/3 cycles.
- Java ControlLeasePolicy, MediaPolicyRpc, and AuthController tests using the actual repository test sources: PASS,
  3/3 cycles. Every runtime cycle reported Corretto 21.0.13.1.
- Dashboard and production example Compose rendering: PASS. Missing-secret rendering remains fail-closed by design.
- Focused repository tests: 46 passed.
- Source-size, code-quality baseline, critical-code, runtime-lifecycle, closed-network, and supply-chain gates: PASS.

These results establish source and disposable-container compatibility. They do not authorize deployment and do not
claim that Server-01 currently runs the patched images.
