# ASD STIG V6R4 official source / CCI restoration

Date: 2026-10-16. Scope: #656, POAM-SEC-007 only. This is source and mapping evidence,
not a STIG certification, external assessment, authorization, or production deployment.

## Acquisition and integrity

The historical individual ZIP URL returned HTTP 404 on this date. The same V6R4 archive was
retained inside the official DISA January 2026 compilation, downloaded over verified HTTPS:

- [Official compilation](https://dl.dod.cyber.mil/wp-content/uploads/stigs/zip/U_SRG-STIG_Library_January_2026.zip)
- [DISA compilation description](https://www.cyber.mil/stigs/compilations/)
- Compilation: 366,986,198 bytes; SHA-256 `e602dfd5cdcb07758d0c49980380b44ef156025b440289af988a171a066ad890`.
- Nested `U_ASD_V6R4_STIG.zip`: SHA-256 `3361a742c58ba7cc3f86bc1fa6aa6b0d9a588824c017a90c9b6786df8ffdd681`.
- Original XCCDF: 1,094,484 bytes; SHA-256 `aa3176db372c3ec336d9489e59d67a4b8ac5a60bd08ffef65a5d687eaf7329a3`.

The XCCDF hash matches the **already committed** `sourceSha256` in the original checklist.
That legacy field identifies the XML bytes, not the individual ZIP bytes. The checklist's
rule identities, content, import date, applicability and NOT_RUN statuses were not rewritten.
No newer STIG revision or third-party mirror was substituted. SHA-256 verifies retained
byte integrity; it is not a DISA digital signature or independently published checksum.
Origin attribution rests on the official HTTPS acquisition and this provenance record.

The nested ZIP and original XML are retained under `docs/compliance/security/sources/`.
The 350 MiB parent compilation remains an acquisition artifact outside Git; its URL,
length and hash are recorded in `asd-stig-v6r4-provenance.json`. Raw XML uses a narrow
Git `-text` attribute so checkout newline conversion cannot invalidate its hash.

## Restored mapping, unchanged verdicts

The retained benchmark identifies Version 6 / Release 4, benchmark date **01 Oct 2025**.
The project profile date is corrected from the unsupported 2025-09-09 value to this
explicit XCCDF benchmark date; the baseline revision stays V6R4.

All **286** V-ID / STIG-ID / Rule-ID / severity / title records match the immutable
checklist. The XML carries **319** CCI references. Only `ident` entries whose system is
`http://cyber.mil/cci` are used; legacy V-ID/SV-ID entries are not CCI identifiers.
The generated provenance contains exact per-rule CCI lists. The 14 existing assessment
entries now use those lists, without inventing identifiers or changing verdicts.
The original assessment date is retained; `cciSourceRestoredAt` separately records this
source-only restoration, not a new functional security assessment.

- 11 NOT_A_FINDING, 274 OPEN, 1 NOT_APPLICABLE remain unchanged.
- Existing NIST control annotations remain tailored mappings; this work does not claim
  a separate authoritative CCI-to-NIST revision crosswalk assessment.
- CA-2 remains OPEN. #656's wider control assessment and other POA&M findings remain open.

## Reproducible gates

`scripts/gates/stig_source_evidence.py` imports the selected nested member without extracting
arbitrary paths, rejects oversized/duplicated ZIP members and XML DTD/entities, and verifies
the raw ZIP/XML hashes, baseline content, rule coverage and every generated CCI list offline.
Its import path refuses to overwrite different retained evidence. It does not fetch network
content in CI or execute the XML stylesheet/check/fix instructions.

```text
python scripts/gates/stig_source_evidence.py
python scripts/gates/stig_assessment_gate.py
python scripts/gates/rmf_evidence_gate.py
```

The assessment gate requires exact source CCI lists, not merely nonempty well-formed strings.
The old BLOCKED label cannot bypass verification. RMF also verifies the retained source, so
changing a POA&M status or keeping a placeholder evidence filename cannot alone clear the gate.
Tests cover tampering, wrong versions, wrong CCI relationships, malformed sources, bounds,
duplicate members and unchanged conservative verdicts.

POAM-SEC-007's original due date **2026-10-15** is unchanged. Source restoration completed
**2026-10-16**, one day late. No deadline extension or accepted-risk exception was created.
Runtime code, mobile behavior, accounts, policies and production infrastructure are unchanged.
