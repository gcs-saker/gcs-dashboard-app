import unittest

from reconcile_maven_sbom import (
    MavenCoordinate,
    MavenReconciliationError,
    reconcile_document,
    validate_correction_count,
)


def sbom_with(purl: str) -> dict:
    return {
        "packages": [
            {
                "SPDXID": "SPDXRef-Package-grpc-core",
                "name": "grpc-core",
                "externalRefs": [{"referenceType": "purl", "referenceLocator": purl}],
            }
        ]
    }


class ReconcileMavenSbomTest(unittest.TestCase):
    def test_corrects_unique_synthetic_group_and_preserves_input(self) -> None:
        source = sbom_with("pkg:maven/io.grpc.internal/grpc-core@1.76.0")
        normalized, changes = reconcile_document(source, [MavenCoordinate("io.grpc", "grpc-core", "1.76.0")])

        self.assertEqual(
            normalized["packages"][0]["externalRefs"][0]["referenceLocator"],
            "pkg:maven/io.grpc/grpc-core@1.76.0",
        )
        self.assertEqual(
            source["packages"][0]["externalRefs"][0]["referenceLocator"], "pkg:maven/io.grpc.internal/grpc-core@1.76.0"
        )
        self.assertEqual(changes[0]["originalPurl"], "pkg:maven/io.grpc.internal/grpc-core@1.76.0")

    def test_leaves_unmatched_coordinate_unchanged(self) -> None:
        source = sbom_with("pkg:maven/jrt-fs/jrt-fs@21.0.12")
        normalized, changes = reconcile_document(source, [])

        self.assertEqual(normalized, source)
        self.assertEqual(changes, [])

    def test_rejects_ambiguous_artifact_and_version(self) -> None:
        coordinates = [
            MavenCoordinate("first.group", "shared", "1.0"),
            MavenCoordinate("second.group", "shared", "1.0"),
        ]

        with self.assertRaisesRegex(MavenReconciliationError, "ambiguous coordinate"):
            reconcile_document(sbom_with("pkg:maven/synthetic/shared@1.0"), coordinates)

    def test_rejects_unexpected_correction_count(self) -> None:
        with self.assertRaisesRegex(MavenReconciliationError, "expected 27"):
            validate_correction_count([], 27)


if __name__ == "__main__":
    unittest.main()
