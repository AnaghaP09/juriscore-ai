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
// Every package name in the lockfile, direct or transitive.
const lovablePackages = new Set(
  [...lock.matchAll(/\["((?:@[^/"]+\/)?[^@"]+)@[^"]+",/g)]
    .map((match) => match[1])
    .filter((name) => /lovable/i.test(name)),
);
for (const name of lovablePackages) findings.push(`bun.lock resolves the package ${name}`);
const mirrorUrls = lock.match(/https:\/\/[^"]*(lovable|pkg\.dev)[^"]*/g) ?? [];
if (mirrorUrls.length > 0) {
  findings.push(`bun.lock downloads ${mirrorUrls.length} package(s) from Lovable's npm mirror`);
}

if (existsSync(join(ROOT, ".lovable"))) findings.push(".lovable/ directory is present");
// Registry configuration: a Lovable mirror here would bring installs back to Lovable even
// with a clean lockfile.
for (const file of [".npmrc", "bunfig.toml", ".yarnrc.yml"]) {
  const path = join(ROOT, file);
  if (existsSync(path) && /lovable|pkg\.dev/i.test(readFileSync(path, "utf8"))) {
    findings.push(`${file} points at a Lovable package or registry`);
  }
}

const SOURCE_DIRS = ["src", "scripts", "public", ".github"];
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
  if (
    rel === SELF ||
    !/\.(ts|tsx|js|mjs|cjs|json|html|css|svg|xml|webmanifest|txt|ya?ml)$/.test(rel)
  )
    continue;
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
// Every inspection must succeed: a failed request is a finding, never an empty result.

/** Inspections that cannot run with this token; the result is then partial. */
const partial: string[] = [];

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8" });
  return { ok: result.status === 0, out: result.stdout ?? "", err: (result.stderr ?? "").trim() };
}

/** `gh api` (optionally paginated), one line per `jq` result. Null when the request failed. */
function ghLines(path: string, jq: string, paginate = true): string[] | null {
  const result = run("gh", ["api", ...(paginate ? ["--paginate"] : []), path, "--jq", jq]);
  if (!result.ok) return null;
  return result.out.split("\n").filter(Boolean);
}

function required(what: string, lines: string[] | null): string[] {
  if (lines === null) findings.push(`could not inspect ${what} (GitHub request failed)`);
  return lines ?? [];
}

const afterCutover = (date: string) => new Date(date) > new Date(CUTOVER);

if (process.argv.includes("--sync")) {
  const repoView = run("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]);
  if (!repoView.ok) {
    findings.push("--sync needs the GitHub CLI signed in (`gh auth login`)");
  } else {
    const repo = repoView.out.trim();

    // 1. Commits by a Lovable identity on any remote branch. Fetch every branch explicitly
    //    (a single-branch clone's refspec would skip the rest) with full history (a shallow
    //    clone would hide older commits); if either is impossible, the scan is incomplete.
    const shallow = run("git", ["rev-parse", "--is-shallow-repository"]);
    const fetched = run("git", [
      "fetch",
      "--quiet",
      "--prune",
      ...(shallow.out.trim() === "true" ? ["--unshallow"] : []),
      "origin",
      "+refs/heads/*:refs/remotes/origin/*",
    ]);
    if (!shallow.ok || !fetched.ok) {
      findings.push(`could not fetch every origin branch with full history: ${fetched.err}`);
    } else if (run("git", ["rev-parse", "--is-shallow-repository"]).out.trim() !== "false") {
      findings.push("the clone is still shallow; commit history is incomplete");
    }
    const log = run("git", [
      "log",
      "--remotes=origin",
      "--format=%H%x09%cI%x09%an <%ae>%x09%cn <%ce>",
    ]);
    if (!log.ok || !log.out.trim()) findings.push(`git log over origin failed: ${log.err}`);
    const lovableCommits = log.out
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split("\t"))
      .filter(([, , author, committer]) => LOVABLE_ACTOR.test(`${author} ${committer}`));
    const latest = lovableCommits
      .map(([sha, date]) => ({ sha, date }))
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (latest) notes.push(`last Lovable commit: ${latest.sha.slice(0, 7)} on ${latest.date}`);
    for (const [sha, date, author] of lovableCommits.filter(([, date]) => afterCutover(date))) {
      findings.push(`Lovable commit after cut-over: ${sha.slice(0, 7)} ${date} by ${author}`);
    }

    // 2. Repository events (GitHub keeps at most 300, from the last 90 days).
    const events: { type: string; at: string; actor: string }[] = [];
    for (let page = 1; page <= 3; page++) {
      const lines = required(
        `repository events page ${page}`,
        ghLines(
          `repos/${repo}/events?per_page=100&page=${page}`,
          ".[] | [.type, .created_at, .actor.login] | @tsv",
          false,
        ),
      );
      if (lines.length === 0) break;
      for (const line of lines) {
        const [type, at, actor] = line.split("\t");
        events.push({ type, at, actor });
      }
    }
    const lovableEvents = events.filter((event) => LOVABLE_ACTOR.test(event.actor));
    const recentEvents = lovableEvents.filter((event) => afterCutover(event.at));
    for (const event of recentEvents) {
      findings.push(`GitHub event ${event.type} by ${event.actor} at ${event.at}`);
    }
    const older = lovableEvents.length - recentEvents.length;
    notes.push(
      `GitHub events scanned: ${events.length}` +
        (older > 0 ? ` (${older} Lovable event(s) from before the cut-over)` : ""),
    );

    // 3. Check runs and statuses from a Lovable app on the default branch head.
    const branch = required(
      "the default branch",
      ghLines(`repos/${repo}`, ".default_branch", false),
    )[0];
    const head = branch
      ? required(
          "the default-branch head",
          ghLines(`repos/${repo}/commits/${branch}`, ".sha", false),
        )[0]
      : undefined;
    if (head !== undefined && !/^[0-9a-f]{40}$/.test(head)) {
      findings.push(`unexpected default-branch head "${head}"`);
    } else if (head !== undefined) {
      const checks = required(
        "check runs",
        ghLines(
          `repos/${repo}/commits/${head}/check-runs?per_page=100`,
          '.check_runs[] | [.name, (.app.slug // "")] | @tsv',
        ),
      );
      for (const line of checks) {
        const [name, slug] = line.split("\t");
        if (LOVABLE_ACTOR.test(slug)) {
          findings.push(`check run "${name}" from app ${slug} on ${branch}`);
        }
      }
      const statuses = required(
        "commit statuses",
        ghLines(
          `repos/${repo}/commits/${head}/statuses?per_page=100`,
          '.[] | [.context, (.creator.login // "")] | @tsv',
        ),
      );
      for (const line of statuses) {
        const [context, creator] = line.split("\t");
        if (LOVABLE_ACTOR.test(`${context} ${creator}`)) {
          findings.push(`commit status "${context}" from ${creator} on ${branch}`);
        }
      }
      notes.push(
        `${branch} @ ${head.slice(0, 7)}: ${checks.length} check run(s), ${statuses.length} status(es)`,
      );
    }

    // 4. Webhooks pointing at Lovable. Reading them needs admin rights, which the workflow
    //    token does not have, so an unreadable list is reported as partial coverage.
    const hooks = ghLines(`repos/${repo}/hooks?per_page=100`, '.[] | (.config.url // "")');
    if (hooks === null) partial.push("webhooks (needs admin rights)");
    for (const url of hooks ?? []) {
      if (/lovable/i.test(url)) findings.push(`webhook to ${url}`);
    }

    partial.push("the GitHub App installation (no token can list it from here)");
    notes.push(
      `check ${INSTALLATIONS_URL} for "Lovable" (or "GPT Engineer") and uninstall it or remove this repository.`,
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
if (!process.argv.includes("--sync")) {
  console.log(
    "JurisCore Lovable check passed: no Lovable dependency (run with --sync to ask GitHub).",
  );
} else {
  console.log("JurisCore Lovable check passed: no Lovable dependency and no sync activity.");
  if (partial.length > 0) console.log(`  Not inspected: ${partial.join("; ")}.`);
}
