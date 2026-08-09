import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface CheckResult {
  name: string;
  status: "pass" | "fail" | "warn" | "skipped";
  critical: boolean;
  weight: number;
  summary: string;
  fixes: string[];
  details?: string;
}

const MAX_DETAILS = 4000;

function run(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number | null; output: string; timedOut: boolean; spawnError?: string }> {
  return new Promise((resolve) => {
    let output = "";
    let timedOut = false;
    const child = spawn(command, args, { cwd, shell: true, windowsHide: true });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d) => (output += d.toString()));
    child.stderr.on("data", (d) => (output += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: null, output, timedOut: false, spawnError: e.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output: output.slice(-MAX_DETAILS), timedOut });
    });
  });
}

async function isAvailable(command: string, cwd: string): Promise<boolean> {
  const r = await run(command, ["--version"], cwd, 15000);
  return r.code === 0;
}

function hasScript(appPath: string, script: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(appPath, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const s = pkg.scripts?.[script];
    return Boolean(s && !s.includes("no test specified"));
  } catch {
    return false;
  }
}

// ---------- individual checks ----------

async function checkTypes(appPath: string): Promise<CheckResult> {
  if (!existsSync(join(appPath, "tsconfig.json"))) {
    return {
      name: "typecheck",
      status: "skipped",
      critical: false,
      weight: 0,
      summary: "No tsconfig.json found.",
      fixes: [],
    };
  }
  const r = await run("npx", ["--yes", "tsc", "--noEmit"], appPath, 180000);
  const ok = r.code === 0;
  return {
    name: "typecheck",
    status: ok ? "pass" : "fail",
    critical: false,
    weight: 20,
    summary: ok ? "TypeScript compiles with no errors." : "TypeScript errors found.",
    fixes: ok ? [] : ["Fix every TypeScript error reported in the details."],
    details: ok ? undefined : r.output,
  };
}

async function checkLint(appPath: string): Promise<CheckResult> {
  const hasConfig = ["eslint.config.js", "eslint.config.mjs", "eslint.config.ts", ".eslintrc.json", ".eslintrc.js"].some(
    (f) => existsSync(join(appPath, f)),
  );
  if (!hasConfig) {
    return {
      name: "lint",
      status: "warn",
      critical: false,
      weight: 5,
      summary: "No ESLint config found.",
      fixes: ["Add ESLint (the scaffold templates include it by default)."],
    };
  }
  const r = await run("npx", ["--yes", "eslint", ".", "--max-warnings=50"], appPath, 180000);
  const ok = r.code === 0;
  return {
    name: "lint",
    status: ok ? "pass" : "fail",
    critical: false,
    weight: 10,
    summary: ok ? "ESLint passes." : "ESLint errors found.",
    fixes: ok ? [] : ["Fix the ESLint errors in the details."],
    details: ok ? undefined : r.output,
  };
}

async function checkTests(appPath: string): Promise<CheckResult> {
  if (!hasScript(appPath, "test")) {
    return {
      name: "tests",
      status: "fail",
      critical: false,
      weight: 15,
      summary: "No test script defined - the app has no automated tests.",
      fixes: ["Add unit tests for business logic and one end-to-end test for the main flow."],
    };
  }
  const r = await run("npm", ["test", "--silent"], appPath, 420000);
  const ok = r.code === 0;
  return {
    name: "tests",
    status: ok ? "pass" : "fail",
    critical: false,
    weight: 15,
    summary: ok ? "Test suite passes." : r.timedOut ? "Tests timed out." : "Tests fail.",
    fixes: ok ? [] : ["Make the failing tests pass (fix the code, not the tests, unless a test is wrong)."],
    details: ok ? undefined : r.output,
  };
}

async function checkDependencies(appPath: string): Promise<CheckResult> {
  if (await isAvailable("osv-scanner", appPath)) {
    const r = await run("osv-scanner", ["scan", "--format", "json", "."], appPath, 180000);
    try {
      const parsed = JSON.parse(r.output.slice(r.output.indexOf("{"))) as { results?: unknown[] };
      const count = parsed.results?.length ?? 0;
      const ok = count === 0;
      return {
        name: "dependency-vulnerabilities",
        status: ok ? "pass" : "fail",
        critical: !ok,
        weight: 15,
        summary: ok ? "osv-scanner: no known vulnerabilities." : `osv-scanner found issues in ${count} source(s).`,
        fixes: ok ? [] : ["Upgrade the affected dependencies to patched versions."],
        details: ok ? undefined : r.output.slice(0, MAX_DETAILS),
      };
    } catch {
      /* fall through to npm audit */
    }
  }
  if (!existsSync(join(appPath, "package-lock.json"))) {
    return {
      name: "dependency-vulnerabilities",
      status: "skipped",
      critical: false,
      weight: 0,
      summary: "No package-lock.json; dependency scan skipped.",
      fixes: [],
    };
  }
  const r = await run("npm", ["audit", "--json"], appPath, 120000);
  try {
    const parsed = JSON.parse(r.output.slice(r.output.indexOf("{"))) as {
      metadata?: { vulnerabilities?: Record<string, number> };
    };
    const v = parsed.metadata?.vulnerabilities ?? {};
    const high = (v.high ?? 0) + (v.critical ?? 0);
    const total = Object.values(v).reduce((a, b) => a + b, 0);
    const ok = high === 0;
    return {
      name: "dependency-vulnerabilities",
      status: ok ? (total > 0 ? "warn" : "pass") : "fail",
      critical: (v.critical ?? 0) > 0,
      weight: 15,
      summary: ok
        ? total > 0
          ? `npm audit: ${total} low/moderate advisories (no high/critical).`
          : "npm audit: no known vulnerabilities."
        : `npm audit: ${high} high/critical vulnerabilities.`,
      fixes: ok ? [] : ["Run `npm audit fix`; for remaining advisories upgrade the affected packages."],
      details: ok ? undefined : r.output.slice(0, MAX_DETAILS),
    };
  } catch {
    return {
      name: "dependency-vulnerabilities",
      status: "warn",
      critical: false,
      weight: 5,
      summary: "Could not parse npm audit output.",
      fixes: ["Run `npm audit` manually and address findings."],
    };
  }
}

const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "Stripe secret key", re: /sk_(live|test)_[A-Za-z0-9]{16,}/ },
  { name: "AWS access key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "GitHub token", re: /gh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: "Private key block", re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "Google API key", re: /AIza[0-9A-Za-z_-]{30,}/ },
  { name: "Slack token", re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: "JWT hardcoded", re: /eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/ },
];
const SCAN_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ".env", ".yaml", ".yml", ".toml", ".md", ".py"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", "out"]);

function scanSecrets(dir: string, findings: string[], depth = 0): void {
  if (depth > 8 || findings.length >= 25) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) scanSecrets(full, findings, depth + 1);
    } else if (st.size < 1_000_000) {
      const ext = entry.includes(".") ? entry.slice(entry.lastIndexOf(".")) : "";
      const isEnv = entry === ".env" || entry.startsWith(".env.");
      if (!SCAN_EXTS.has(ext) && !isEnv) continue;
      if (entry === ".env.example" || entry === ".env.template") continue;
      let content: string;
      try {
        content = readFileSync(full, "utf8");
      } catch {
        continue;
      }
      for (const p of SECRET_PATTERNS) {
        if (p.re.test(content)) findings.push(`${p.name} in ${full}`);
      }
    }
  }
}

async function checkSecrets(appPath: string): Promise<CheckResult> {
  if (await isAvailable("gitleaks", appPath)) {
    const r = await run("gitleaks", ["detect", "--source", ".", "--no-banner", "--exit-code", "1"], appPath, 120000);
    const ok = r.code === 0;
    return {
      name: "secrets",
      status: ok ? "pass" : "fail",
      critical: !ok,
      weight: 15,
      summary: ok ? "gitleaks: no secrets found." : "gitleaks found committed secrets.",
      fixes: ok ? [] : ["Remove the secrets, rotate them, and move values to environment variables."],
      details: ok ? undefined : r.output.slice(0, MAX_DETAILS),
    };
  }
  const findings: string[] = [];
  scanSecrets(appPath, findings);
  const ok = findings.length === 0;
  return {
    name: "secrets",
    status: ok ? "pass" : "fail",
    critical: !ok,
    weight: 15,
    summary: ok
      ? "Built-in secret scan: no secrets found. (Install gitleaks for deeper scanning.)"
      : `Built-in secret scan found ${findings.length} potential secret(s).`,
    fixes: ok ? [] : ["Remove and ROTATE every found secret; load them from environment variables instead."],
    details: ok ? undefined : findings.join("\n"),
  };
}

async function checkSemgrep(appPath: string): Promise<CheckResult> {
  if (!(await isAvailable("semgrep", appPath))) {
    return {
      name: "static-security-analysis",
      status: "skipped",
      critical: false,
      weight: 0,
      summary: "semgrep not installed - static security analysis skipped. (pip install semgrep)",
      fixes: [],
    };
  }
  const r = await run("semgrep", ["scan", "--config", "auto", "--json", "--quiet"], appPath, 300000);
  try {
    const parsed = JSON.parse(r.output) as { results?: { check_id: string; path: string }[] };
    const results = parsed.results ?? [];
    const ok = results.length === 0;
    return {
      name: "static-security-analysis",
      status: ok ? "pass" : "fail",
      critical: false,
      weight: 10,
      summary: ok ? "semgrep: no findings." : `semgrep: ${results.length} finding(s).`,
      fixes: ok ? [] : ["Review and fix each semgrep finding in the details."],
      details: ok
        ? undefined
        : results
            .slice(0, 30)
            .map((f) => `${f.check_id} @ ${f.path}`)
            .join("\n"),
    };
  } catch {
    return {
      name: "static-security-analysis",
      status: "warn",
      critical: false,
      weight: 0,
      summary: "semgrep ran but output could not be parsed.",
      fixes: [],
    };
  }
}

async function checkLighthouse(appPath: string, url?: string): Promise<CheckResult> {
  if (!url) {
    return {
      name: "lighthouse",
      status: "skipped",
      critical: false,
      weight: 0,
      summary: "No running app URL provided - pass `url` (e.g. http://localhost:3000) to include Lighthouse.",
      fixes: [],
    };
  }
  const r = await run(
    "npx",
    ["--yes", "lighthouse", url, "--quiet", '--chrome-flags="--headless=new"', "--output=json", "--output-path=stdout", "--only-categories=performance,accessibility,best-practices,seo"],
    appPath,
    420000,
  );
  try {
    const jsonStart = r.output.indexOf("{");
    const parsed = JSON.parse(r.output.slice(jsonStart)) as {
      categories?: Record<string, { title: string; score: number | null }>;
    };
    const cats = parsed.categories ?? {};
    const scores = Object.values(cats).map((c) => ({ title: c.title, score: Math.round((c.score ?? 0) * 100) }));
    const min = Math.min(...scores.map((s) => s.score));
    const ok = min >= 80;
    return {
      name: "lighthouse",
      status: ok ? "pass" : min >= 60 ? "warn" : "fail",
      critical: false,
      weight: 10,
      summary: scores.map((s) => `${s.title}: ${s.score}`).join(", "),
      fixes: ok ? [] : ["Raise every Lighthouse category to at least 80 (see details for the failing audits)."],
      details: ok ? undefined : r.output.slice(0, 1500),
    };
  } catch {
    return {
      name: "lighthouse",
      status: "warn",
      critical: false,
      weight: 0,
      summary: "Lighthouse could not run (needs Chrome and a reachable URL).",
      fixes: [],
    };
  }
}

// ---------- pipeline ----------

export interface AuditReport {
  score: number;
  passed: boolean;
  criticalFindings: string[];
  checks: CheckResult[];
  fixList: string[];
}

export async function runAudit(appPath: string, url?: string): Promise<AuditReport> {
  const checks = [
    await checkTypes(appPath),
    await checkLint(appPath),
    await checkTests(appPath),
    await checkDependencies(appPath),
    await checkSecrets(appPath),
    await checkSemgrep(appPath),
    await checkLighthouse(appPath, url),
  ];

  const weighted = checks.filter((c) => c.weight > 0);
  const totalWeight = weighted.reduce((a, c) => a + c.weight, 0);
  const earned = weighted.reduce((a, c) => {
    if (c.status === "pass") return a + c.weight;
    if (c.status === "warn") return a + c.weight * 0.5;
    return a;
  }, 0);
  const score = totalWeight === 0 ? 0 : Math.round((earned / totalWeight) * 100);
  const criticalFindings = checks.filter((c) => c.critical).map((c) => `${c.name}: ${c.summary}`);
  const passed = score >= 80 && criticalFindings.length === 0;
  const fixList = checks.flatMap((c) => c.fixes.map((f) => `[${c.name}] ${f}`));

  return { score, passed, criticalFindings, checks, fixList };
}
