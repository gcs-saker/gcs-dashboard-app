# OS package license remediation — 2026-09-17

## First batch

The remaining auth-policy OS-package UNKNOWN was Alpine `libmd 1.2.0-r0`. Alpine identifies libmd
as BSD-2-Clause, BSD-3-Clause, ISC, Beerware, and Public Domain. Fedora's version 1.2.0 package
metadata independently records the same upstream composite license.

The exact Alpine PURL is now resolved to that composite expression. Beerware and Public Domain are
not globally allowed, so the package becomes `REVIEW_REQUIRED`, not `ALLOWED`.

Docker replay of the auth-policy SBOM now reports:

- `ALLOWED: 148`
- `FIRST_PARTY: 2`
- `REVIEW_REQUIRED: 28`
- `UNKNOWN: 0`

This closes UNKNOWN classification for the auth-policy image only. Debian and Alpine packages in the
backend, dashboard, MQTT, and TURN image reports remain in scope for issue #712.
