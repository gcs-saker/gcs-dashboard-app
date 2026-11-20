from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
PATCHED_NGINX = "1.31.9"
PATCHED_CORRETTO_BUILD_DIGEST = "a02f509af88bd1544d5bb42be83a20d9022dc15f388a0007e2c7d0d87170b9f4"
PATCHED_CORRETTO_RUNTIME_DIGEST = "600e99e39da14b6a909027a924136c423e9334cb7347a8a77d5908bdaa3011b7"


def test_dashboard_and_local_edges_use_patched_nginx() -> None:
    dockerfile = (ROOT / "gcs-dashboard/Dockerfile").read_text(encoding="utf-8")
    dashboard_compose = yaml.safe_load((ROOT / "gcs-dashboard/docker-compose.yml").read_text(encoding="utf-8"))
    local_override = yaml.safe_load(
        (ROOT / "deploy/compose/compose.local-dev.override.yml").read_text(encoding="utf-8")
    )

    assert f"FROM nginx:{PATCHED_NGINX}-alpine-slim@sha256:" in dockerfile
    assert dashboard_compose["services"]["edge"]["image"].startswith(f"nginx:{PATCHED_NGINX}-alpine@sha256:")
    assert local_override["services"]["mobile-publisher"]["image"].startswith(f"nginx:{PATCHED_NGINX}-alpine@sha256:")


def test_production_edge_uses_patched_unprivileged_nginx_registry() -> None:
    compose = yaml.safe_load((ROOT / "deploy/compose/compose.single-node.poc.yml").read_text(encoding="utf-8"))
    image = compose["services"]["edge"]["image"]

    assert image == "${EDGE_IMAGE:-gcs-saker-edge:arch-poc}"
    assert "nginxinc/nginx-unprivileged" not in image


def test_auth_policy_build_and_runtime_use_patched_corretto() -> None:
    dockerfile = (ROOT / "services/auth-policy/Dockerfile").read_text(encoding="utf-8")
    build_image = f"amazoncorretto:21@sha256:{PATCHED_CORRETTO_BUILD_DIGEST}"
    runtime_image = f"amazoncorretto:21-alpine@sha256:{PATCHED_CORRETTO_RUNTIME_DIGEST}"

    assert f"FROM {build_image} AS build" in dockerfile
    assert f"FROM {runtime_image}" in dockerfile
    assert "FROM gradle:" not in dockerfile
    assert "java -classpath gradle/wrapper/gradle-wrapper.jar org.gradle.wrapper.GradleWrapperMain" in dockerfile
    assert "dnf install" not in dockerfile


def test_gradle_wrapper_distribution_is_checksum_pinned() -> None:
    properties = (ROOT / "services/auth-policy/gradle/wrapper/gradle-wrapper.properties").read_text(encoding="utf-8")

    assert "distributionUrl=https\\://services.gradle.org/distributions/gradle-8.14.3-bin.zip" in properties
    assert "distributionSha256Sum=bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531" in properties


def test_auth_policy_uses_current_tomcat_security_patch() -> None:
    build = (ROOT / "services/auth-policy/build.gradle.kts").read_text(encoding="utf-8")

    assert 'extra["tomcat.version"] = "10.1.62"' in build
