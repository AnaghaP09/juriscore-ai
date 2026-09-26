import { DRIFT_FEATURES_VERSION } from "../core/contracts";
import { BUILT_IN_SUBJECTS, type DiffFile } from "../plumb/sources";
import { isDocPath, normalizeDocPath } from "./doc-paths";

/**
 * Deterministic features of a code change, for estimating whether the change needs an
 * accompanying documentation update.
 *
 * Everything here is a pure function of the parsed change: no clock, no randomness, no
 * network. The unit is the whole change, never its first file, and the vector is the
 * same whatever order the files arrive in. Documentation files are removed before any
 * feature is computed, because a change that edits docs is exactly what the predictor
 * is trying to forecast.
 */

export const FEATURES_VERSION = DRIFT_FEATURES_VERSION;

export type PredictionSourceKind = "diff" | "snapshot";

export interface PredictionInput {
  /**
   * How the source was loaded: a unified diff, or a whole file pasted as the current
   * state. Set by the caller from the parser it used, never guessed from line kinds.
   */
  sourceKind: PredictionSourceKind;
  /** Every parsed file of the change. */
  files: DiffFile[];
}

export type PredictionUnavailableReason = "no-baseline" | "no-code-files";

export interface PredictionUnavailable {
  status: "unavailable";
  reason: PredictionUnavailableReason;
}

/** Feature names in the order weights and attributions list them. */
export const FEATURE_NAMES = [
  "path_config_files",
  "path_schema_files",
  "path_api_files",
  "path_source_files",
  "path_test_files",
  "numeric_literals_changed",
  "string_literals_changed",
  "public_symbol_changes",
  "additions_log",
  "deletions_log",
  "code_files_log",
  "subject_key_hits",
  "identifier_signal_hits",
  "constant_default_changes",
  "comment_only_ratio",
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];

export type FeatureVector = Record<FeatureName, number>;

export interface FeatureExtraction {
  status: "ok";
  featuresVersion: typeof FEATURES_VERSION;
  vector: FeatureVector;
  /** Code files the features were computed from, sorted by path. */
  codePaths: string[];
  /**
   * Documentation files the change already touches, sorted. Reported as a plain fact;
   * never a model input.
   */
  docsTouched: string[];
}

// ---------------------------------------------------------------------------
// Path classes
// ---------------------------------------------------------------------------

export type PathClass = "config" | "schema" | "api" | "source" | "test";

const PATH_FEATURE: Record<PathClass, FeatureName> = {
  config: "path_config_files",
  schema: "path_schema_files",
  api: "path_api_files",
  source: "path_source_files",
  test: "path_test_files",
};

const TEST_DIRECTORIES = new Set(["test", "tests", "__tests__", "spec", "specs"]);
const API_DIRECTORIES = new Set(["api", "routes", "controllers", "handlers"]);
const CONFIG_DIRECTORIES = new Set(["config", "configs", "settings"]);

const TEST_FILE = /(?:[._-](?:test|spec)\.[a-z0-9]+|^test_.*\.py)$/;
const SCHEMA_FILE = /\.(?:sql|proto|graphql|gql|prisma|avsc|xsd)$|schema/;
const API_FILE = /openapi|swagger|controller|handler|endpoint/;
const CONFIG_EXTENSION = /\.(?:json|ya?ml|toml|ini|env|conf|cfg|properties)$/;
const CONFIG_NAME = /^\.env|^dockerfile|config|settings/;

/** First matching rule wins, in the order test → schema → api → config → source. */
export function classifyPath(path: string): PathClass {
  const segments = normalizeDocPath(path).toLowerCase().split("/");
  const basename = segments[segments.length - 1] ?? "";
  const directories = segments.slice(0, -1);
  const inDirectory = (names: Set<string>) => directories.some((name) => names.has(name));

  if (inDirectory(TEST_DIRECTORIES) || TEST_FILE.test(basename)) return "test";
  if (SCHEMA_FILE.test(basename) || directories.includes("migrations")) return "schema";
  if (inDirectory(API_DIRECTORIES) || API_FILE.test(basename)) return "api";
  if (CONFIG_EXTENSION.test(basename) || CONFIG_NAME.test(basename)) return "config";
  if (inDirectory(CONFIG_DIRECTORIES)) return "config";
  return "source";
}

// ---------------------------------------------------------------------------
// Line rules
// ---------------------------------------------------------------------------

const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*|--|<!--|#)/;
const PREPROCESSOR = /^\s*#\s*(?:define|include|if|ifdef|ifndef|endif|else|elif|pragma)\b/;
const NUMERIC_LITERAL = /(?<![\w.])\d[\d_]*(?:\.\d+)?(?!\w)/g;
const STRING_LITERAL = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
const IDENTIFIER = /[A-Za-z_][A-Za-z0-9_]*/g;

const PUBLIC_SYMBOL = [
  /^\s*(?:export|public|pub|pub\(crate\))\s/,
  /^\s*(?:module\.exports|exports\.)/,
  /^\s*def\s+[A-Za-z]/,
  /^\s*func\s+(?:\([^)]*\)\s*)?[A-Z]/,
];

const CONSTANT_OR_DEFAULT = [
  /^\s*(?:export\s+)?(?:const|enum|readonly|final|static\s+final|#define)\s/,
  /^\s*[A-Z][A-Z0-9_]{2,}\s*[:=]/,
  /\bdefaults?\b/,
];

export const IDENTIFIER_SIGNALS = [
  "fee",
  "limit",
  "threshold",
  "max",
  "timeout",
  "retention",
  "quota",
  "price",
  "rate",
  "version",
] as const;

const SIGNAL_WORDS = new Set<string>(IDENTIFIER_SIGNALS);

// The direct bridge to Plumb: identifiers the built-in subject dictionary reads values
// from.
const SUBJECT_KEYS = new Set<string>();
for (const subject of BUILT_IN_SUBJECTS) {
  for (const key of subject.codeKeys) SUBJECT_KEYS.add(key.toLowerCase());
}

/** Splits an identifier into lowercase words: `maxUploadLimit`, `MAX_UPLOAD` → max, upload. */
function identifierWords(identifier: string) {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

function isSubjectKey(identifier: string) {
  return SUBJECT_KEYS.has(identifier.toLowerCase());
}

function hasSignalWord(identifier: string) {
  return identifierWords(identifier).some((word) => SIGNAL_WORDS.has(word));
}

function matchesAny(patterns: RegExp[], text: string) {
  return patterns.some((pattern) => pattern.test(text));
}

interface LineCounts {
  numeric: number;
  string: number;
  publicSymbol: number;
  subjectKey: number;
  signal: number;
  constantDefault: number;
  comment: number;
}

const COMMENT_COUNTS: LineCounts = {
  numeric: 0,
  string: 0,
  publicSymbol: 0,
  subjectKey: 0,
  signal: 0,
  constantDefault: 0,
  comment: 1,
};

function countLine(text: string): LineCounts {
  if (COMMENT_LINE.test(text) && !PREPROCESSOR.test(text)) return COMMENT_COUNTS;

  const identifiers: string[] = text.match(IDENTIFIER) ?? [];
  return {
    numeric: (text.replace(STRING_LITERAL, "").match(NUMERIC_LITERAL) ?? []).length,
    string: (text.match(STRING_LITERAL) ?? []).length,
    publicSymbol: Number(matchesAny(PUBLIC_SYMBOL, text)),
    subjectKey: Number(identifiers.some(isSubjectKey)),
    signal: Number(identifiers.some(hasSignalWord)),
    constantDefault: Number(matchesAny(CONSTANT_OR_DEFAULT, text)),
    comment: 0,
  };
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

function byPath(a: DiffFile, b: DiffFile) {
  if (a.path === b.path) return 0;
  return a.path < b.path ? -1 : 1;
}

/**
 * Computes the change-level feature vector.
 *
 * Per file, only added and deleted lines count; context lines never do. Across files,
 * every feature is a sum, so the vector does not depend on file order (files are also
 * sorted by path first). Sizes are log-scaled so one very large change cannot swamp
 * every other signal. Version 1 has no boolean features; were one added, it would
 * aggregate by max.
 */
export function extractDriftFeatures(
  input: PredictionInput,
): FeatureExtraction | PredictionUnavailable {
  // A pasted whole file has no changed lines. Scoring it would invent a change.
  if (input.sourceKind === "snapshot") return { status: "unavailable", reason: "no-baseline" };

  const docsTouched = new Set<string>();
  const codeFiles: DiffFile[] = [];
  for (const file of [...input.files].sort(byPath)) {
    if (isDocPath(file.path)) docsTouched.add(file.path);
    else codeFiles.push(file);
  }
  if (codeFiles.length === 0) return { status: "unavailable", reason: "no-code-files" };

  const vector = Object.fromEntries(FEATURE_NAMES.map((name) => [name, 0])) as FeatureVector;
  let additions = 0;
  let deletions = 0;
  let commentLines = 0;

  for (const file of codeFiles) {
    vector[PATH_FEATURE[classifyPath(file.path)]] += 1;

    for (const line of file.lines) {
      if (line.kind === "ctx") continue;
      if (line.kind === "add") additions += 1;
      else deletions += 1;

      const counts = countLine(line.text);
      vector.numeric_literals_changed += counts.numeric;
      vector.string_literals_changed += counts.string;
      vector.public_symbol_changes += counts.publicSymbol;
      vector.subject_key_hits += counts.subjectKey;
      vector.identifier_signal_hits += counts.signal;
      vector.constant_default_changes += counts.constantDefault;
      commentLines += counts.comment;
    }
  }

  const changedLines = additions + deletions;
  vector.additions_log = Math.log1p(additions);
  vector.deletions_log = Math.log1p(deletions);
  vector.code_files_log = Math.log1p(codeFiles.length);
  vector.comment_only_ratio = changedLines === 0 ? 0 : commentLines / changedLines;

  return {
    status: "ok",
    featuresVersion: FEATURES_VERSION,
    vector,
    codePaths: codeFiles.map((file) => file.path),
    docsTouched: [...docsTouched],
  };
}
