#!/usr/bin/env bash
set -euo pipefail

host="${1:?usage: check_public_tls.sh <host> [port]}"
port="${2:-443}"
warning_days="${TLS_WARNING_DAYS:-30}"

certificate="$(mktemp)"
trap 'rm -f "$certificate"' EXIT

openssl s_client -connect "${host}:${port}" -servername "$host" -verify_return_error </dev/null 2>/dev/null \
  | openssl x509 -outform PEM >"$certificate"
openssl x509 -in "$certificate" -checkend "$((warning_days * 86400))" -noout >/dev/null

subject_alt_names="$(openssl x509 -in "$certificate" -noout -ext subjectAltName)"
grep -Fq "DNS:${host}" <<<"$subject_alt_names"

expires_at="$(openssl x509 -in "$certificate" -noout -enddate | cut -d= -f2-)"
fingerprint="$(openssl x509 -in "$certificate" -noout -fingerprint -sha256 | cut -d= -f2-)"
printf 'tls_ok host=%s port=%s expires_at=%q sha256=%s\n' "$host" "$port" "$expires_at" "$fingerprint"
