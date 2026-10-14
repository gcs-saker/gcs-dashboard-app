import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/smoke/m7_single_node_runtime_smoke.sh"


@pytest.mark.parametrize(
    "function_name, payload, expected",
    [
        ("login_token_for", '{"access_token":"test-token"}', b"test-token\n"),
        (
            "turn_credentials",
            '{"iceServers":[{"urls":"turn:127.0.0.1:3478","username":"test-user","credential":"test-password"}]}',
            b"turn:127.0.0.1:3478\ttest-user\ttest-password\n",
        ),
    ],
)
def test_bash_credentials_remain_lf_only_with_windows_python_output(
    function_name: str,
    payload: str,
    expected: bytes,
) -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    function = re.search(rf"(?ms)^{function_name}\(\) \{{.*?^\}}", source)
    assert function is not None
    # Simulate Windows TextIOWrapper newline translation on every test platform.
    shell = r"""
set -euo pipefail
curl() { printf '%s' "$TEST_JSON"; }
python3() {
  "$TEST_PYTHON" -c 'import io, sys; sys.stdout = io.TextIOWrapper(sys.stdout.buffer, newline="\r\n"); exec(sys.argv[1])' "$2"
}
"""
    shell += function.group() + f"\n{function_name} http://127.0.0.1 test-user test-password\n"
    result = subprocess.run(
        ["bash", "-c", shell],
        check=True,
        capture_output=True,
        timeout=5,
        env={**os.environ, "TEST_JSON": payload, "TEST_PYTHON": sys.executable},
    )

    assert result.stdout == expected
    assert b"\r" not in result.stdout
