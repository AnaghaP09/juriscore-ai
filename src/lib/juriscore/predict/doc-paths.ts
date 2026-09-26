/**
 * The one rule that decides whether a path is documentation.
 *
 * The same rule labels mined training data, strips documentation out of a change before
 * features are computed, and reports which docs a change already touched. If any of the
 * three used a different rule, the predictor could see the label it is meant to predict,
 * so the rule is versioned and every caller imports it from here.
 */

export const DOC_PATHS_VERSION = "doc-paths.v1";

const DOC_EXTENSIONS = /\.(?:md|mdx|rst)$/i;
const DOC_BASENAMES = /^(?:readme|changelog)(?:[._-].*)?$/i;
const DOC_DIRECTORY = "docs";

export function normalizeDocPath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * `*.md`, `*.mdx`, `*.rst`, anything under a `docs/` directory at any depth, and any
 * `README*` or `CHANGELOG*` file.
 */
export function isDocPath(path: string) {
  const segments = normalizeDocPath(path).split("/").filter(Boolean);
  if (segments.length === 0) return false;

  const basename = segments[segments.length - 1];
  if (DOC_EXTENSIONS.test(basename)) return true;
  if (DOC_BASENAMES.test(basename)) return true;
  return segments.slice(0, -1).some((segment) => segment.toLowerCase() === DOC_DIRECTORY);
}
