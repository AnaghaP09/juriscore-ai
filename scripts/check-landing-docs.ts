import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PAGES, renderMarkdown, renderPage, SITE } from "./build-landing-docs";

// PLAN-7: the Setup and Run pages are generated from the Markdown sources at deploy time.
// This check renders both here so a document the converter cannot render fails CI, not the
// site, and it keeps the home page short and the Run guide honest.

const root = resolve(import.meta.dir, "..");
const indexHtml = readFileSync(join(root, "landing/index.html"), "utf8");

for (const page of PAGES) {
  const markdown = readFileSync(join(root, page.source), "utf8");
  const html = renderPage(indexHtml, page, markdown);
  const body = renderMarkdown(markdown);

  // Every heading of the source appears in the output.
  for (const match of markdown.matchAll(/^#{1,4}\s+(.+)$/gm)) {
    const text = match[1].replace(/`/g, "").replace(/\*\*/g, "");
    assert.ok(
      body.replace(/<[^>]+>/g, "").includes(text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")),
      `${page.source}: heading not rendered: ${match[1]}`,
    );
  }
  // No Markdown marker survives outside code blocks.
  const outsideCode = body.replace(/<pre><code>[\s\S]*?<\/code><\/pre>/g, "").replace(/<code>[\s\S]*?<\/code>/g, "");
  for (const marker of ["\n## ", "```", "|---", "**", "](http"]) {
    assert.equal(outsideCode.includes(marker), false, `${page.source}: raw Markdown "${marker}" in output`);
  }
  // Site links are relative on the site; the current page is marked in the navigation.
  assert.equal(html.includes(`href="${SITE}/setup.html"`), false, `${page.output}: absolute site link left`);
  assert.ok(html.includes(`href="./${page.nav}.html" aria-current="page"`), `${page.output}: nav not marked`);
  for (const other of ["index", "setup", "run", "release-notes"]) {
    assert.ok(html.includes(`href="./${other}.html"`), `${page.output}: nav lacks ${other}`);
  }
}

// The Run guide must not claim "no outbound" or "nothing is sent" without a qualifier.
{
  const run = readFileSync(join(root, "packaging/RUN.md"), "utf8");
  const sentences = run.replace(/\s+/g, " ").split(/(?<=[.!?])\s/);
  for (const sentence of sentences) {
    if (/no outbound|nothing is sent|makes no external call|persists nothing|nothing is persisted/i.test(sentence)) {
      assert.ok(
        /except|besides|apart from|other than|three things|only outbound|the server stores nothing/i.test(sentence),
        `RUN.md: unqualified network or persistence claim: "${sentence.trim()}"`,
      );
    }
  }
  assert.ok(run.includes(`${SITE}/setup.html`), "RUN.md links the Setup page on the site");
  assert.ok(/## Get the package/.test(run), "RUN.md starts with how to get the package");
  assert.ok(/PowerShell/.test(run) && /Command Prompt/.test(run), "RUN.md gives both Windows shells");
  assert.ok(/\$env:HOST/.test(run), "RUN.md gives the PowerShell form for HOST");
}

// The home page stays short: visible text under 450 words.
{
  const text = indexHtml
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = text.split(" ").length;
  assert.ok(words < 450, `landing/index.html has ${words} visible words; keep it under 450`);
  for (const link of ["./setup.html", "./run.html", "./release-notes.html"]) {
    assert.ok(indexHtml.includes(`href="${link}"`), `home nav lacks ${link}`);
  }
}

console.log("JurisCore AI landing docs checks passed.");
