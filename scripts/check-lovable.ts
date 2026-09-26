/**
 * Reports whether JurisCore still depends on, or syncs with, Lovable.
 *
 *   bun run check:lovable          offline: no Lovable package, import, config or registry URL
 *   bun run check:lovable --sync   also asks GitHub (via the `gh` CLI) for Lovable sync activity
 *
 * Lovable's GitHub App commits as `gpt-engineer-app[bot]` (Lovable's earlier name) or as
 * `Lovable <noreply@lovable.dev>`. Any such commit, event or check run after the cut-over
 * means Lovable is still writing to the repository. Exit code 1 on any finding.
 *
 * What this cannot see: whether the Lovable GitHub App is still *installed* (reading pushes
 * without writing). A user token cannot list app installations, so the report links to the
 * page where the owner can check and uninstall it.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** Commits after this date by a Lovable identity mean Lovable is still syncing. */
const CUTOVER = "2026-09-27T00:00:00Z";
const LOVABLE_ACTOR = /gpt-engineer|lovable/i;
const INSTALLATIONS_URL = "https://github.com/settings/installations";

const findings: string[] = [];
const notes: string[] = [];

// --- Offline: dependencies, imports, config -------------------------------------------------

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as Record<
  string,
  Record<string, string> | undefined
>;
for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
  for (const name of Object.keys(pkg[field] ?? {})) {
    if (name.startsWith("@lovable.dev/") || /lovable/i.test(name)) {
      findings.push(`package.json ${field} lists ${name}`);
    }
  }
}

const lock = readFileSync(join(ROOT, "bun.lock"), "utf8");
if (/@lovable\.dev\//.test(lock)) findings.push("bun.lock still resolves an @lovable.dev package");
const mirrorUrls = lock.match(/https:\/\/[^"]*(lovable|pkg\.dev)[^"]*/g) ?? [];
if (mirrorUrls.length > 0) {
  findings.push(`bun.lock downloads ${mirrorUrls.length} package(s) from Lovable's npm mirror`);
}

if (existsSync(join(ROOT, ".lovable"))) findings.push(".lovable/ directory is present");
const bunfig = join(ROOT, "bunfig.toml");
if (existsSync(bunfig) && /lovable/i.test(readFileSync(bunfig, "utf8"))) {
  findings.push("bunfig.toml mentions Lovable packages");
}

const SOURCE_DIRS = ["src", "scripts", "public"];
const SOURCE_FILES = ["vite.config.ts", "tsconfig.json", "eslint.config.js", "index.html"];
const SELF = relative(ROOT, fileURLToPath(import.meta.url));
function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}
const scanned: string[] = [];
for (const dir of SOURCE_DIRS) {
  if (existsSync(join(ROOT, dir))) scanned.push(...walk(join(ROOT, dir)));
}
for (const file of SOURCE_FILES) if (existsSync(join(ROOT, file))) scanned.push(join(ROOT, file));
for (const path of scanned) {
  const rel = relative(ROOT, path);
  if (rel === SELF || !/\.(ts|tsx|js|mjs|cjs|json|html|css)$/.test(rel)) continue;
  const text = readFileSync(path, "utf8");
  if (/@lovable\.dev|lovable\.(app|dev|js)|__lovable|lovableproject\.com/i.test(text)) {
    findings.push(`${rel.replaceAll("\\", "/")} references Lovable`);
  }
}

// Binary assets carried over from the Lovable prototype, by SHA-256.
const LOVABLE_ASSETS: Record<string, string> = {
  dd821076a9b03adc2173c93956226aea3d92482d7578fc4339c5d3a2e9c24586:
    "Lovable's favicon (prototype import)",
};
for (const dir of ["public", "src/assets"]) {
  if (!existsSync(join(ROOT, dir))) continue;
  for (const path of walk(join(ROOT, dir))) {
    const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
    const what = LOVABLE_ASSETS[digest];
    if (what) findings.push(`${relative(ROOT, path).replaceAll("\\", "/")} is ${what}`);
  }
}

// --- Online: sync activity on GitHub (--sync) -----------------------------------------------

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8" });
  return { ok: result.status === 0, out: result.stdout ?? "", err: result.stderr ?? "" };
}

function gh<T>(path: string): T | null {
  const result = run("gh", ["api", path]);
  if (!result.ok) return null;
  return JSON.parse(result.out) as T;
}

if (process.argv.includes("--sync")) {
  const repoView = run("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]);
  if (!repoView.ok) {
    findings.push("--sync needs the GitHub CLI signed in (`gh auth login`)");
  } else {
    const repo = repoView.out.trim();

    // 1. Commits by a Lovable identity on any remote branch.
    run("git", ["fetch", "--quiet", "--prune", "origin"]);
    const log = run("git", [
      "log",
      "--remotes=origin",
      "--format=%H%x09%cI%x09%an <%ae>%x09%cn <%ce>",
    ]);
    const lovableCommits = log.out
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split("\t"))
      .filter(([, , author, committer]) => LOVABLE_ACTOR.test(`${author} ${committer}`));
    const latest = lovableCommits
      .map(([sha, date]) => ({ sha, date }))
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (latest) notes.push(`last Lovable commit: ${latest.sha.slice(0, 7)} on ${latest.date}`);
    const recent = lovableCommits.filter(([, date]) => new Date(date) > new Date(CUTOVER));
    for (const [sha, date, author] of recent) {
      findings.push(`Lovable commit after cut-over: ${sha.slice(0, 7)} ${date} by ${author}`);
    }

    // 2. Repository events (last 90 days, up to 300) by a Lovable actor.
    const events: { type: string; created_at: string; actor: { login: string } }[] = [];
    for (let page = 1; page <= 3; page++) {
      const batch = gh<typeof events>(`repos/${repo}/events?per_page=100&page=${page}`);
      if (!batch || batch.length === 0) break;
      events.push(...batch);
    }
    for (const event of events.filter((e) => LOVABLE_ACTOR.test(e.actor.login))) {
      findings.push(`GitHub event ${event.type} by ${event.actor.login} at ${event.created_at}`);
    }
    notes.push(`GitHub events scanned: ${events.length}`);

    // 3. Check runs and statuses from a Lovable app on the default branch head.
    const head = run("git", ["rev-parse", "origin/HEAD"]).out.trim() || "HEAD";
    const checks = gh<{ check_runs: { name: string; app: { slug: string } | null }[] }>(
      `repos/${repo}/commits/${head}/check-runs`,
    );
    for (const check of checks?.check_runs ?? []) {
      if (LOVABLE_ACTOR.test(check.app?.slug ?? "")) {
        findings.push(
          `check run "${check.name}" from app ${check.app?.slug} on the default branch`,
        );
      }
    }
    const statuses = gh<{ statuses: { context: string; creator: { login: string } | null }[] }>(
      `repos/${repo}/commits/${head}/status`,
    );
    for (const status of statuses?.statuses ?? []) {
      if (LOVABLE_ACTOR.test(`${status.context} ${status.creator?.login ?? ""}`)) {
        findings.push(`commit status "${status.context}" from ${status.creator?.login}`);
      }
    }

    // 4. Webhooks pointing at Lovable (needs admin rights; skipped otherwise).
    const hooks = gh<{ config: { url?: string } }[]>(`repos/${repo}/hooks`);
    if (hooks === null) notes.push("webhooks: not readable with this token (skipped)");
    for (const hook of hooks ?? []) {
      if (/lovable/i.test(hook.config.url ?? "")) findings.push(`webhook to ${hook.config.url}`);
    }

    notes.push(
      `GitHub App installation can't be read with a user token: check ${INSTALLATIONS_URL} ` +
        'for "Lovable" (or "GPT Engineer") and uninstall or remove this repository.',
    );
  }
}

// --- Report ---------------------------------------------------------------------------------

for (const note of notes) console.log(`  · ${note}`);
if (findings.length > 0) {
  console.error("Lovable ties found:");
  for (const finding of findings) console.error(`  ✗ ${finding}`);
  process.exit(1);
}
console.log(
  process.argv.includes("--sync")
    ? "JurisCore Lovable check passed: no Lovable dependency and no sync activity."
    : "JurisCore Lovable check passed: no Lovable dependency (run with --sync to ask GitHub).",
);
