from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DOC = REPO_ROOT / "docs" / "architecture" / "GCS-Saker_M10_spring_modulith_boundary.md"


def test_spring_modulith_boundary_doc_exists_and_names_modules() -> None:
    text = DOC.read_text(encoding="utf-8")

    for module in [
        "`api`",
        "`application`",
        "`configuration`",
        "`domain`",
        "`infrastructure`",
        "`observability`",
        "`protocol`",
    ]:
        assert module in text


def test_spring_modulith_boundary_doc_captures_validation_gates() -> None:
    text = DOC.read_text(encoding="utf-8")

    for term in [
        "ApplicationModules.of(AuthPolicyApplication::class.java).verify()",
        "SpringModulithBoundaryTest",
        "BoundedContextBoundaryTest",
        "Controller는 HTTP 연결과 orchestration만 담당한다",
        "Domain은 Spring Web, Redis, JDBC 같은 infrastructure 세부 구현을 참조하지 않는다",
        "Protocol은 wire format과 domain 변환만 담당",
    ]:
        assert term in text
