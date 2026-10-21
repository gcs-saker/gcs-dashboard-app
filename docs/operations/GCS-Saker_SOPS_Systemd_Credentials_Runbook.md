# SOPS and systemd credential secret delivery

The encrypted bundle uses schema `gcs-saker.encrypted-secret-bundle.v1` with a `secrets` object whose
keys exactly match `deploy/runtime-credentials/server01-required-secret-names.txt`. Encrypt the JSON
with SOPS and an age recipient outside the runtime host. Only the encrypted bundle is retained.

Store the Server-01 age identity with `systemd-creds encrypt` as
`/etc/credstore.encrypted/gcs-saker-sops-age-key`. The materialization unit loads it through
`LoadCredentialEncrypted`; the identity is not passed on a command line or written to the repository.

`materialize_sops_secrets.sh` streams decrypted JSON directly into the bounded Python materializer.
It never creates a decrypted aggregate bundle. Output is limited to the exact allowlist and written as
individual mode `0600` files, or mode `0440` for the named runtime group, under the mode `0700` systemd runtime
directory. Unknown, missing, empty,
oversized, or malformed entries fail closed without printing values.

This repository does not install or start the unit on Server-01 automatically. Installation, encrypted
credential enrollment, Compose source-path cutover, restart, and rollback require a separately approved
maintenance window. Stopping the unit removes the runtime directory; retain the previous encrypted
bundle and credential until rollback qualification passes.

## One-time legacy enrollment

An existing Server-01 installation may populate an empty owner-only runtime directory from its private legacy
environment files with `scripts/ops/enroll_legacy_runtime_secrets.py`. The primary file owns every value it
defines; supplements fill missing names and never override the primary source. Production enrollment uses
`--disable-signup` and `--generate-mediamtx-password`, so no static signup invite is activated and the generated
MediaMTX credential is never printed. The tool refuses an incomplete allowlist or an output directory that
already contains a managed secret. It writes mode `0440` files for the named runtime group.

This is a transition mechanism, not the long-term source of truth. After deployment qualification, seal the same
values into the SOPS bundle and enroll the systemd encrypted age credential before removing the protected legacy
environment files.
