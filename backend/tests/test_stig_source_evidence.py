import copy
import io
import json
import runpy
import shutil
import zipfile
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
GATE = ROOT / "scripts/gates/stig_source_evidence.py"


def source_module():
    return runpy.run_path(str(GATE))


def seed_root(destination: Path) -> None:
    module = source_module()
    for name in ("ARCHIVE", "XCCDF", "MANIFEST", "CHECKLIST"):
        relative = module[name]
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / relative, target)


def synthetic_xml() -> bytes:
    return b"""<Benchmark xmlns="http://checklists.nist.gov/xccdf/1.1" id="Application_Security_Development_STIG">
<version>6</version><plain-text id="release-info">Release: 4 Benchmark Date: 01 Oct 2025</plain-text>
<Group id="V-222387"><Rule id="SV-222387r960735_rule" severity="medium"><version>APSC-DV-000010</version>
<title>Fixture</title><ident system="http://cyber.mil/legacy">V-69239</ident>
<ident system="http://cyber.mil/cci">CCI-000054</ident></Rule></Group></Benchmark>"""


def test_retained_official_source_restores_all_pinned_identities_and_cci_references() -> None:
    module = source_module()
    mappings = module["validate"](ROOT)
    assert len(mappings) == 286
    assert sum(map(len, mappings.values())) == 319
    assert mappings["V-222389"] == ["CCI-002361"]
    assert mappings["V-222477"] == ["CCI-001487"]
    assert (
        module["digest"]((ROOT / module["XCCDF"]).read_bytes())
        == "aa3176db372c3ec336d9489e59d67a4b8ac5a60bd08ffef65a5d687eaf7329a3"
    )


def test_only_cci_system_identifiers_are_imported_not_legacy_ids() -> None:
    module = source_module()
    rule = module["parse_rules"](synthetic_xml())[0]
    assert rule["cciRefs"] == ["CCI-000054"]


@pytest.mark.parametrize(
    "before,after",
    [
        (b"Release: 4", b"Release: 5"),
        (b"<version>6</version>", b"<version>7</version>"),
        (b"Application_Security_Development_STIG", b"Other_STIG"),
        (b"xccdf/1.1", b"xccdf/1.2"),
        (b"CCI-000054", b"CCI-invalid"),
        (b"http://cyber.mil/cci", b"https://untrusted.example/cci"),
        (b"APSC-DV-000010", b"arbitrary"),
        (b"SV-222387r960735_rule", b"invalid"),
    ],
)
def test_wrong_version_namespace_or_identifiers_are_rejected(before: bytes, after: bytes) -> None:
    module = source_module()
    with pytest.raises(module["StigSourceEvidenceError"]):
        module["parse_rules"](synthetic_xml().replace(before, after))


@pytest.mark.parametrize("prefix", [b'<!DOCTYPE Benchmark SYSTEM "file:///private">', b'<!ENTITY leak "secret">'])
def test_dtd_and_entity_inputs_fail_without_external_resolution(prefix: bytes) -> None:
    module = source_module()
    with pytest.raises(module["StigSourceEvidenceError"], match="untrusted XML"):
        module["parse_rules"](prefix + synthetic_xml())


def test_missing_duplicate_and_oversized_xml_fail_closed() -> None:
    module = source_module()
    for payload in (b"", b"<", b"x" * (module["MAX_XML_BYTES"] + 1)):
        with pytest.raises(module["StigSourceEvidenceError"]):
            module["parse_rules"](payload)
    payload = synthetic_xml()
    group = payload[payload.index(b"<Group") : payload.index(b"</Group>") + len(b"</Group>")]
    with pytest.raises(module["StigSourceEvidenceError"], match="duplicated"):
        module["parse_rules"](payload.replace(b"</Benchmark>", group + b"</Benchmark>"))


@pytest.mark.parametrize(
    "member_names,maximum", [(["other.xml"], 100), (["source.xml", "source.xml"], 100), (["source.xml"], 1)]
)
def test_archive_member_must_be_unique_present_and_bounded(member_names: list[str], maximum: int) -> None:
    module = source_module()
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as writer:
        for name in member_names:
            writer.writestr(name, b"fixture")
    with zipfile.ZipFile(io.BytesIO(archive.getvalue())) as reader:
        with pytest.raises(module["StigSourceEvidenceError"]):
            module["member_bytes"](reader, "source.xml", maximum)


@pytest.mark.parametrize(
    "field,replacement",
    [
        ("officialCompilationUrl", "https://untrusted.example/source.zip"),
        ("archiveMember", "../other.zip"),
        ("xccdfMember", "../private.xml"),
        ("xccdfSha256", "0" * 64),
        ("archiveSha256", "0" * 64),
        ("compilationSha256", "invalid"),
        ("retrievedAt", "not-a-date"),
        ("ruleCount", 1),
        ("compilationBytes", True),
        ("compilationBytes", 0),
    ],
)
def test_corrupt_provenance_cannot_pass(tmp_path: Path, field: str, replacement: object) -> None:
    module = source_module()
    seed_root(tmp_path)
    path = tmp_path / module["MANIFEST"]
    manifest = json.loads(path.read_text())
    manifest[field] = replacement
    path.write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(module["StigSourceEvidenceError"]):
        module["validate"](tmp_path)


@pytest.mark.parametrize("name", ["XCCDF", "ARCHIVE"])
def test_retained_bytes_are_hash_verified_not_just_file_existence(tmp_path: Path, name: str) -> None:
    module = source_module()
    seed_root(tmp_path)
    path = tmp_path / module[name]
    path.write_bytes(path.read_bytes() + b"tampered")
    with pytest.raises(module["StigSourceEvidenceError"], match="hash mismatch"):
        module["validate"](tmp_path)


def test_manifest_mapping_must_match_the_exact_rule_not_just_a_well_formed_cci(tmp_path: Path) -> None:
    module = source_module()
    seed_root(tmp_path)
    path = tmp_path / module["MANIFEST"]
    manifest = json.loads(path.read_text())
    manifest["rules"][0]["cciRefs"] = ["CCI-002361"]
    path.write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(module["StigSourceEvidenceError"], match="mapping differs"):
        module["validate"](tmp_path)


def test_assessment_rejects_a_cci_from_another_official_rule() -> None:
    source = source_module()
    assessment = runpy.run_path(str(ROOT / "scripts/gates/stig_assessment_gate.py"))
    checklist = json.loads((ROOT / source["CHECKLIST"]).read_text())
    rules = {rule["findingId"]: rule for rule in checklist["rules"]}
    context = assessment["AssessmentContext"](rules, set(), source["validate"](ROOT))
    rule = copy.deepcopy(assessment["load_assessment"]()["rules"][0])
    rule["cciRefs"] = ["CCI-000054"]
    with pytest.raises(assessment["StigAssessmentError"], match="differs from retained"):
        assessment["validate_rule"](rule, context)


def test_old_blocker_label_cannot_bypass_cci_verification() -> None:
    assessment = runpy.run_path(str(ROOT / "scripts/gates/stig_assessment_gate.py"))
    with pytest.raises(assessment["StigAssessmentError"], match="requires verified"):
        assessment["verified_cci_mappings"]({"cciSourceStatus": "BLOCKED_OFFICIAL_XCCDF_NOT_RETAINED"})


def test_closure_records_real_evidence_without_extending_due_date_or_changing_verdicts() -> None:
    security = ROOT / "docs/compliance/security"
    poam = yaml.safe_load((security / "poam.yml").read_text())
    item = next(item for item in poam["items"] if item["id"] == "POAM-SEC-007")
    assert str(item["dueBy"]) == "2026-10-15"
    assert str(item["closedAt"]) == "2026-10-16" and item["status"] == "CLOSED"
    assert "docs/compliance/security/sources/asd-stig-v6r4-provenance.json" in item["evidence"]
    counts = runpy.run_path(str(ROOT / "scripts/gates/stig_assessment_gate.py"))["validate"]()
    assert counts == {"NOT_A_FINDING": 11, "OPEN": 274, "NOT_APPLICABLE": 1}
    assert "sources/U_ASD_STIG_V6R4_Manual-xccdf.xml -text" in (ROOT / ".gitattributes").read_text()


def test_missing_source_cannot_close_the_rmf_gate(monkeypatch: pytest.MonkeyPatch) -> None:
    module = runpy.run_path(str(ROOT / "scripts/gates/rmf_evidence_gate.py"))
    source = source_module()

    def refuse(_root: Path):
        raise source["StigSourceEvidenceError"]("private-location")

    monkeypatch.setattr(
        module["runpy"],
        "run_path",
        lambda *_: {
            "VERIFIED_STATUS": source["VERIFIED_STATUS"],
            "StigSourceEvidenceError": source["StigSourceEvidenceError"],
            "validate": refuse,
        },
    )
    with pytest.raises(module["RmfEvidenceError"], match="verification failed"):
        module["validate_cci_source"]({"cciMappingStatus": source["VERIFIED_STATUS"]})


@pytest.mark.parametrize("payload", [[], None, "invalid"])
def test_nonobject_provenance_is_a_typed_failure(tmp_path: Path, payload: object) -> None:
    module = source_module()
    seed_root(tmp_path)
    (tmp_path / module["MANIFEST"]).write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(module["StigSourceEvidenceError"], match="must be an object"):
        module["validate"](tmp_path)


def test_import_refuses_overwriting_retained_provenance_before_any_writes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    module = source_module()
    retained = tmp_path / "retained"
    seed_root(retained)
    compilation = tmp_path / "fixture-compilation.zip"
    with zipfile.ZipFile(compilation, "w") as writer:
        writer.writestr(module["ARCHIVE_MEMBER"], (ROOT / module["ARCHIVE"]).read_bytes())
    before = (retained / module["MANIFEST"]).read_bytes()
    monkeypatch.setitem(module["import_compilation"].__globals__, "ROOT", retained)
    with pytest.raises(module["StigSourceEvidenceError"], match="refusing to overwrite"):
        module["import_compilation"](compilation, "2026-10-16")
    assert (retained / module["MANIFEST"]).read_bytes() == before


def test_import_size_limit_is_checked_before_reading_a_compilation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    module = source_module()
    compilation = tmp_path / "oversized.zip"
    compilation.write_bytes(b"oversized")
    monkeypatch.setitem(module["import_compilation"].__globals__, "MAX_COMPILATION_BYTES", 2)
    with pytest.raises(module["StigSourceEvidenceError"], match="size exceeds bound"):
        module["import_compilation"](compilation, "2026-10-16")
