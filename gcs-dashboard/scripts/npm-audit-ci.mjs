import { spawnSync } from "node:child_process";

const allowedAdvisories = new Set([
  // This advisory only affects applications using React Router's unstable RSC
  // APIs. The GCS dashboard is a client-side SPA and does not use those APIs.
  "https://github.com/advisories/GHSA-qwww-vcr4-c8h2",
]);

const npmCli = process.env.npm_execpath;
const audit = npmCli
  ? spawnSync(
      process.execPath,
      [npmCli, "audit", "--audit-level=moderate", "--json"],
      { encoding: "utf8" },
    )
  : spawnSync(
      "npm",
      ["audit", "--audit-level=moderate", "--json"],
      { encoding: "utf8" },
    );

if (audit.error) {
  console.error(`npm audit 실행 실패: ${audit.error.message}`);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  console.error("npm audit 결과를 JSON으로 해석하지 못했습니다.");
  console.error(audit.stderr || audit.stdout);
  process.exit(1);
}

const vulnerabilities = report.vulnerabilities ?? {};
const decisions = new Map();

function isAllowed(name, visiting = new Set()) {
  if (decisions.has(name)) return decisions.get(name);
  if (visiting.has(name)) return false;

  const vulnerability = vulnerabilities[name];
  if (!vulnerability) return false;

  const nextVisiting = new Set(visiting);
  nextVisiting.add(name);
  const allowed =
    vulnerability.via.length > 0 &&
    vulnerability.via.every((cause) =>
      typeof cause === "string"
        ? isAllowed(cause, nextVisiting)
        : allowedAdvisories.has(cause.url),
    );

  decisions.set(name, allowed);
  return allowed;
}

const blocked = Object.keys(vulnerabilities).filter((name) => !isAllowed(name));
const allowed = Object.keys(vulnerabilities).filter((name) => isAllowed(name));

if (allowed.length > 0) {
  console.warn(
    `적용되지 않는 RSC 전용 권고를 예외 처리했습니다: ${allowed.join(", ")}`,
  );
}

if (blocked.length > 0) {
  console.error(`차단된 npm 취약점: ${blocked.join(", ")}`);
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log("npm 보안 감사 통과");
