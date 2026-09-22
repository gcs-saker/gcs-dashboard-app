# GitHub main branch protection and break-glass runbook

## Normal policy

The `main` branch accepts changes only through a pull request. The branch must be current with `main`,
all review conversations must be resolved, and these checks must succeed:

- `repository-contracts`
- `backend-test`
- `auth-policy-test`
- `media-control-test`
- `frontend-build`

The policy applies to administrators. Force pushes and branch deletion are disabled. Verify the live
setting with:

```bash
python scripts/github/verify_main_branch_protection.py \
  --repository gcs-saker/gcs-dashboard-app
```

For a verifier container without GitHub CLI, pipe a response collected by an authenticated host:

```bash
gh api repos/gcs-saker/gcs-dashboard-app/branches/main/protection | \
  python scripts/github/verify_main_branch_protection.py \
    --repository gcs-saker/gcs-dashboard-app --input-json -
```

## Break-glass policy

Bypass is permitted only when GitHub protection itself prevents an urgent security or availability
recovery and waiting for the normal checks creates greater operational risk. Application deployment
urgency alone is not sufficient.

1. Open an incident issue recording the affected service, risk, owner, approver, and expiry time.
2. Preserve the current protection response and the exact source commit under recovery.
3. Obtain approval from a second named maintainer. The implementer cannot self-approve.
4. Temporarily relax only the minimum blocking setting. Do not enable force pushes or deletion.
5. Apply the smallest reviewed recovery commit and retain command and CI evidence in the incident.
6. Restore protection immediately, run the verifier above, and require the five checks on the
   recovery commit.
7. Close the incident only after documenting the reason, duration, affected commits, and preventive
   action. Any exception still open at its expiry is a release blocker.

If a second maintainer is unavailable, no branch-protection bypass is authorized. Use an operational
rollback that does not mutate `main`.
