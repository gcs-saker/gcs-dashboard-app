# Auth-policy code agreement

The repository root agreement applies in full. These rules specialize it for Kotlin under `services/auth-policy/`.

## Service boundary

- Auth-policy owns identity, authorization, hierarchical group policy, token lifecycle, membership, and operational authorization reads.
- Controllers translate HTTP contracts only. Policy belongs in application/domain services and persistence belongs behind repositories.
- The same operation uses one API contract; authenticated role and group policy determine its permitted scope and result.
- Parent-to-child visibility or talkback does not imply authority to mutate a child group's accounts or group administrator.

## Kotlin and transactions

- Do not use `!!` in production code. Normalize nullable boundary input before domain operations.
- Use sealed domain results or typed exceptions to distinguish validation, unauthenticated, forbidden, conflict, expired, and unavailable outcomes.
- Coroutines declare their dispatcher ownership and bounded timeout. Do not use global coroutine scopes.
- Database transactions are short, own one invariant, and contain no HTTP, gRPC, broker, or filesystem call.
- Entities, API DTOs, policy commands, and domain values remain separate and use explicit mappers.
- Token comparison is constant-time where applicable; raw credentials and token material are never returned after initial issuance.

## Verification

- Kotlin compilation, Spring Modulith verification, unit/integration tests, JaCoCo threshold, migration tests, and runtime image scans must pass.
- Policy changes include same-group, ancestor visibility, descendant non-administration, sibling denial, inactive membership, expiry, and replay tests.
- Suppressed compiler or static-analysis findings require a local reason and a regression test for affected policy behavior.
