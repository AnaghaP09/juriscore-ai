import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Renders `docs/GATEWAY_SETUP.md`, `packaging/RUN.md` and `docs/RELEASE_NOTES.md` into
 * `landing/setup.html`, `landing/run.html` and `landing/release-notes.html` for the GitHub
 * Pages site (PLAN-7; release notes added at the owner's request, 2026-09-30). The Markdown files stay the only
 * source; the Pages workflow runs this before publishing, and the generated files are not
 * committed. The page shell (head, styles, header, footer) is taken from `landing/index.html`
 * so every page shares one look and one navigation.
 *
 * Supported Markdown, on purpose a small subset: `#`..`####` headings, paragraphs, fenced
 * code blocks, inline code, **bold**, [links](url), <autolinks>, `-` lists and `1.` lists
 * (two-space nesting), tables with a `|---|` separator, and `>` quotes. Anything else is
 * rendered as text, and `check-landing-docs.ts` fails if a Markdown marker survives.
 */

export const SITE = "https://anaghap09.github.io/juriscore-ai";
export const PAGES = [
  { source: "docs/GATEWAY_SETUP.md", output: "setup.html", title: "Setup", nav: "setup" },
  { source: "packaging/RUN.md", output: "run.html", title: "Run", nav: "run" },
  {
    source: "docs/RELEASE_NOTES.md",
    output: "release-notes.html",
    title: "Release notes",
    nav: "release-notes",
  },
] as const;

const root = resolve(import.meta.dir, "..");

export function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Absolute site URLs become relative on the site itself, so a local checkout works too. */
function rewriteHref(href: string) {
  if (href.startsWith(`${SITE}/`)) return href.slice(SITE.length + 1);
  return href;
}

export function inline(text: string) {
  // Protect code spans first so nothing inside them is interpreted.
  const codes: string[] = [];
  let out = text.replace(/`([^`]+)`/g, (_, code: string) => {
    codes.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = escapeHtml(out);
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) => {
    return `<a href="${escapeHtml(rewriteHref(href))}">${label}</a>`;
  });
  out = out.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, (_, href: string) => {
    return `<a href="${escapeHtml(rewriteHref(href))}">${escapeHtml(href)}</a>`;
  });
  return out.replace(/\u0000(\d+)\u0000/g, (_, index: string) => codes[Number(index)]);
}

function slug(text: string) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

interface ListFrame {
  ordered: boolean;
  indent: number;
}

export function renderMarkdown(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  const lists: ListFrame[] = [];
  let paragraph: string[] = [];
  let quote: string[] = [];
  let index = 0;

  const closeLists = (toIndent = -1) => {
    while (lists.length > 0 && lists[lists.length - 1].indent > toIndent) {
      const frame = lists.pop()!;
      html.push(`</li></${frame.ordered ? "ol" : "ul"}>`);
    }
  };
  const flushParagraph = () => {
    if (paragraph.length > 0) {
      html.push(`<p>${inline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const flushQuote = () => {
    if (quote.length > 0) {
      html.push(`<blockquote><p>${inline(quote.join(" "))}</p></blockquote>`);
      quote = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushQuote();
  };

  while (index < lines.length) {
    const raw = lines[index];
    const line = raw.trimEnd();

    if (line.trim() === "") {
      flushAll();
      index += 1;
      continue;
    }

    if (/^-{3,}$/.test(line.trim())) {
      flushAll();
      closeLists();
      html.push("<hr />");
      index += 1;
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      closeLists();
      const level = heading[1].length;
      const text = inline(heading[2]);
      html.push(`<h${level} id="${slug(heading[2])}">${text}</h${level}>`);
      index += 1;
      continue;
    }

    const fence = /^(\s*)```/.exec(line);
    if (fence) {
      flushAll();
      const indent = fence[1].length;
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index])) {
        body.push(lines[index].slice(Math.min(indent, lines[index].length - lines[index].trimStart().length)));
        index += 1;
      }
      index += 1;
      if (indent === 0) closeLists();
      html.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    if (/^\|/.test(line)) {
      flushAll();
      closeLists();
      const rows: string[] = [];
      while (index < lines.length && /^\|/.test(lines[index].trimEnd())) {
        rows.push(lines[index].trimEnd());
        index += 1;
      }
      const cells = (row: string) =>
        row
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((cell) => cell.trim());
      const [head, separator, ...body] = rows;
      if (!separator || !/^\|\s*:?-+/.test(separator)) {
        throw new Error(`Table without a separator row near: ${head}`);
      }
      html.push("<table><thead><tr>");
      for (const cell of cells(head)) html.push(`<th>${inline(cell)}</th>`);
      html.push("</tr></thead><tbody>");
      for (const row of body) {
        html.push("<tr>");
        for (const cell of cells(row)) html.push(`<td>${inline(cell)}</td>`);
        html.push("</tr>");
      }
      html.push("</tbody></table>");
      continue;
    }

    const item = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (item) {
      flushAll();
      const indent = item[1].length;
      const ordered = /\d/.test(item[2]);
      const top = lists[lists.length - 1];
      if (!top || indent > top.indent) {
        lists.push({ ordered, indent });
        html.push(`<${ordered ? "ol" : "ul"}><li>${inline(item[3])}`);
      } else {
        closeLists(indent);
        const frame = lists[lists.length - 1];
        if (!frame) {
          lists.push({ ordered, indent });
          html.push(`<${ordered ? "ol" : "ul"}><li>${inline(item[3])}`);
        } else {
          html.push(`</li><li>${inline(item[3])}`);
        }
      }
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushParagraph();
      quote.push(line.replace(/^>\s?/, ""));
      index += 1;
      continue;
    }

    // Continuation of a list item (indented text) or a plain paragraph line.
    if (lists.length > 0 && /^\s{2,}\S/.test(raw)) {
      html.push(` ${inline(line.trim())}`);
      index += 1;
      continue;
    }
    if (lists.length > 0) closeLists();
    paragraph.push(line.trim());
    index += 1;
  }
  flushAll();
  closeLists();
  return html.join("\n");
}

/** Head, header and footer from index.html, with the current page marked in the nav. */
export function shellFrom(indexHtml: string, current: string) {
  const headEnd = indexHtml.indexOf("<body");
  const header = /<header>[\s\S]*?<\/header>/.exec(indexHtml)?.[0];
  const footer = /<footer[\s\S]*?<\/footer>/.exec(indexHtml)?.[0];
  if (headEnd < 0 || !header || !footer) throw new Error("index.html shell markers not found");
  const head = indexHtml.slice(0, headEnd);
  const marked = header.replace(
    new RegExp(`(<a class="link" href="\\./${current}\\.html")`),
    '$1 aria-current="page"',
  );
  return { head, header: marked, footer };
}

export function renderPage(indexHtml: string, page: (typeof PAGES)[number], markdown: string) {
  const { head, header, footer } = shellFrom(indexHtml, page.nav);
  const body = renderMarkdown(markdown);
  const title = head.replace(/<title>[\s\S]*?<\/title>/, `<title>${page.title} — JurisCore AI</title>`);
  return `${title}<body>
    <div class="shell">
      ${header}
      <main>
        <section class="band">
          <div class="wrap doc">
${body}
          </div>
        </section>
      </main>
      ${footer}
    </div>
  </body>
</html>
`;
}

if (import.meta.main) {
  const indexHtml = readFileSync(join(root, "landing/index.html"), "utf8");
  for (const page of PAGES) {
    const markdown = readFileSync(join(root, page.source), "utf8");
    writeFileSync(join(root, "landing", page.output), renderPage(indexHtml, page, markdown));
    console.log(`landing/${page.output} <- ${page.source}`);
  }
}
