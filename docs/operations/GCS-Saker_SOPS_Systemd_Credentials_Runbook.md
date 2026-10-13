# SOPS and systemd credential secret delivery

The encrypted bundle uses schema `gcs-saker.encrypted-secret-bundle.v1` with a `secrets` object whose
keys exactly match `deploy/runtime-credentials/server01-required-secret-names.txt`. Encrypt the JSON
with SOPS and an age recipient outside the runtime host. Only the encrypted bundle is retained.

Store the Server-01 age identity with `systemd-creds encrypt` as
`/etc/credstore.encrypted/gcs-saker-sops-age-key`. The materialization unit loads it through
`LoadCredentialEncrypted`; the identity is not passed on a command line or written to the repository.

`materialize_sops_secrets.sh` streams decrypted JSON directly into the bounded Python materializer.
It never creates a decrypted aggregate bundle. Output is limited to the exact allowlist and written as
individual mode `0600` files under the mode `0700` systemd runtime directory. Unknown, missing, empty,
oversized, or malformed entries fail closed without printing values.

This repository does not install or start the unit on Server-01 automatically. Installation, encrypted
credential enrollment, Compose source-path cutover, restart, and rollback require a separately approved
maintenance window. Stopping the unit removes the runtime directory; retain the previous encrypted
bundle and credential until rollback qualification passes.
