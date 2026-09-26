# Predictive doc-drift risk (Plumb): training and evaluation

**Status.** The product still ships the **labelled placeholder weights** (`src/lib/juriscore/predict/weights.json`,
`placeholder: true`, maturity `target`). The first fitted model, trained on real history, did **not** meet the promotion
bar. Its weights and metrics are kept as training artifacts in `ml/data/weights.drift.fitted.json` and
`ml/data/drift-metrics.json`. The predictor is advisory: `compareClaims` alone decides allow, revise or block.

## What it predicts

The question is: *does this code change need an accompanying docs update?* The label comes from commit history. A
commit that changes code **and** touches a documentation file is positive; a code-only commit is negative.
Documentation files are decided by the shared `isDocPath` rule (`doc-paths.v1`):

- `*.md`, `*.mdx` and `*.rst` files
- anything under a `docs/` directory
- `README*` and `CHANGELOG*` files

Documentation files are stripped out before features are computed, so the model never sees its own label.
Documentation-only commits are not examples.

## Data

- **Source.** Fifteen permissively licensed repositories, each pinned to a commit. The list, licenses and pins are in
  `ml/data/SOURCES.md`.
- **Mining.** For each repository, the last 1,000 non-merge commits were mined with `git log -p -U0`. Commits with
  more than 20,000 patch lines were skipped as vendored, generated or mass reformats.
- **Examples.** 12,076 commits were used; 25% are positive.

| Split | Repositories | Commits | Positive |
|---|---|---|---|
| train | 8 (stripe-node, hyperswitch, requests, httpx, express, fastapi, traefik, pip) | 5,868 | 1,592 |
| validation | urllib3, cli/cli, moov-io/ach | 2,636 | 440 |
| held-out test | stripe-go, docker/compose, flask, jest | 3,572 | 1,012 |

The split is by repository, never by commit, so test numbers measure transfer to projects the model never saw.

## Method (train/serve parity)

1. `bun scripts/extract-features.ts` turns each commit into a row. It uses the app's own `parseUnifiedDiff`,
   `isDocPath` and `extractDriftFeatures` (`drift-features.v1`, 15 features).
2. `python ml/train_drift.py` fits an L2 logistic regression with scikit-learn (seed 7). C is chosen on validation
   PR-AUC; the chosen value was 0.03.
3. Standardisation is folded into the exported coefficients, so the app's dot-product scorer reproduces the fit
   exactly.
4. Bands are set on validation:
   - **uncertain** starts where F1 peaks (0.323).
   - **high** is the top 5% of validation scores (0.345).

`scripts/check-ml.ts` checks the following:
- Mined features equal the workbench's features for the same patch.
- Committed feature rows match `ml/data/features.sha256`.
- The fitted pack loads through the app's weight validator.

## Results on held-out repositories

| | Precision | Recall | F1 | AUC |
|---|---|---|---|---|
| Majority class (always "no docs needed") | 0.000 | 0.000 | 0.000 | — |
| Rule: "config files touched" | 0.241 | 0.270 | 0.254 | — |
| **Fitted model** (at the uncertain band) | 0.481 | 0.432 | **0.455** | 0.637 |
| Placeholder weights (for comparison) | 0.319 | 0.932 | 0.475 | 0.561 |

The fitted model is well calibrated overall: expected calibration error is 0.052, and the reliability bins are in
`ml/data/drift-metrics.json`.

**Why it was not promoted.** Promotion needs a pooled win **and** a median per-repository AUC of at least 0.55. The
pooled win was there. The per-repository ranking was not:

| Held-out repository | AUC |
|---|---|
| stripe-go | 0.94 |
| docker/compose | 0.43 |
| jest | 0.40 |
| flask | 0.42 |

The pooled number comes mostly from telling repositories apart, not commits within one repository.

The fitted coefficients show what it learned: more code files → more likely docs, and comment-only changes → less
likely docs. That captures commit *size and scope*, not whether a documented value changed. The v1 features count
changed literals and symbols but cannot see *which* documented value moved.

## Limits and next steps

- The label includes changelog entries, so repositories that keep a changelog per PR look "documented" whatever the
  change. A v2 label could separate changelog fragments from user docs.
- Suggested v2 features:
  - a changed identifier or value that also appears in the repository's docs (a direct code↔doc link)
  - features relative to the repository's usual commit
  - separate changelog and doc signals
- **Owner decision:** keep the placeholder weights (current), or ship the fitted weights. The fitted weights raise far
  fewer false alarms (18% of doc-free commits flagged vs 79%) and are better pooled, but are weaker within most
  individual repositories.
