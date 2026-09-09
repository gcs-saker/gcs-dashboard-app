# System Administrator MFA and recovery

Production requires TOTP for the `ADMIN` role. Viewer, operator, and group-admin authentication is
unchanged. Generate enrollment material only on an approved operator workstation:

```bash
python3 scripts/ops/generate_admin_mfa_material.py \
  --output /absolute/private/path/admin01-mfa.json
```

Store `totpSecretBase32` as `AUTH_POLICY_ADMIN_MFA_SECRET`. Store only the comma-separated
`recoveryCodeSha256` values as `AUTH_POLICY_ADMIN_MFA_RECOVERY_HASHES`. Give the ten raw recovery
codes to the named administrator over a separate protected channel. Never paste raw codes into an
issue, log, chat, or source file.

An administrator enters the six-digit TOTP or one recovery code in the login MFA field. TOTP time
steps and recovery codes are recorded in `admin_mfa_recovery_use`; replay is rejected before access
or refresh tokens are issued. A recovery-code login is an emergency action: audit it, generate a new
TOTP secret and recovery set, replace the private environment values, increment the administrator's
security version, revoke existing refresh sessions, and securely destroy the old material.

If both TOTP and recovery material are lost, use the named break-glass operator procedure with two
authorized people present. Stop public administrator login, back up PostgreSQL, replace MFA material,
invalidate existing administrator sessions, validate one successful MFA login and one replay denial,
then restore public access. Disabling `AUTH_POLICY_ADMIN_MFA_REQUIRED` is not an approved recovery
method.
