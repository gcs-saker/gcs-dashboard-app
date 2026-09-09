# Internal PKI rotation and revocation

Leaf certificates are valid for 90 days and trigger a gate failure 14 days before expiry. Generate
the replacement PKI in a new owner-only directory; never overwrite the active CA. Build a dual-trust
bundle with `stage_internal_ca_rotation.sh`, deploy only the CA bundle first, and confirm old client
and server identities still work.

Issue replacement leaves from the new CA. Roll server identities first while clients trust both CAs,
then rotate clients and device certificates. Verify gRPC authorization denial and MQTT cross-device
topic denial after each service. Once every active identity chains to the new CA, remove the old CA
from the bundle and repeat the checks. A failed phase restores the prior bundle and certificates;
stateful MQTT recreation requires its verified backup and sequential health checks.

For compromise or device retirement, run `revoke_internal_certificate.sh`. It updates the CA database
and atomically replaces `ca.crl`. Reload or sequentially recreate the consuming service, then prove
the revoked certificate is rejected with `openssl verify -crl_check` and an actual connection denial.
Root CA compromise does not use leaf revocation; execute the full dual-trust replacement with incident
response approval and preserve the old audit evidence.
