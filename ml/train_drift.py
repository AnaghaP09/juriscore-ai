"""Fits the Plumb drift-risk predictor (Phase B). Dev-only.

Rows come from `bun scripts/extract-features.ts` (the app's own extractor). The split is by
REPOSITORY, fixed below, so held-out metrics measure generalisation to unseen projects.

Usage: python ml/train_drift.py --rows ml/data/work/rows --out-weights src/lib/juriscore/predict/weights.json \
         --out-metrics ml/data/drift-metrics.json --seed 7
"""

from __future__ import annotations

import argparse
import glob
import json
import os

import numpy as np

from common import (SEED, best_f1_threshold, binary_metrics, fit, reliability,
                    score_metrics, select_C, sha256_file, write_json)

FEATURES = [
    "path_config_files", "path_schema_files", "path_api_files", "path_source_files", "path_test_files",
    "numeric_literals_changed", "string_literals_changed", "public_symbol_changes", "additions_log",
    "deletions_log", "code_files_log", "subject_key_hits", "identifier_signal_hits",
    "constant_default_changes", "comment_only_ratio",
]
TEST_REPOS = {"stripe/stripe-go", "docker/compose", "pallets/flask", "jestjs/jest"}
VAL_REPOS = {"urllib3/urllib3", "cli/cli", "moov-io/ach"}


def load(rows_dir: str):
    rows = []
    for path in sorted(glob.glob(os.path.join(rows_dir, "*.jsonl"))):
        with open(path, encoding="utf-8") as handle:
            rows.extend(json.loads(line) for line in handle if line.strip())
    return rows


def arrays(rows):
    X = np.array([r["vector"] for r in rows], dtype=float)
    y = np.array([r["label"] for r in rows], dtype=int)
    return X, y


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", required=True)
    parser.add_argument("--out-weights", required=True)
    parser.add_argument("--out-metrics", required=True)
    parser.add_argument("--seed", type=int, default=SEED)
    args = parser.parse_args()
    np.random.seed(args.seed)

    rows = load(args.rows)
    split = {"train": [], "val": [], "test": []}
    for r in rows:
        split["test" if r["repo"] in TEST_REPOS else "val" if r["repo"] in VAL_REPOS else "train"].append(r)
    (Xtr, ytr), (Xva, yva), (Xte, yte) = (arrays(split[k]) for k in ("train", "val", "test"))

    C, grid = select_C(Xtr, ytr, Xva, yva)
    model = fit(Xtr, ytr, C)
    pva, pte = model.proba(Xva), model.proba(Xte)

    # "uncertain" starts where F1 peaks on validation repositories; "high" marks the top 5%
    # of validation scores. A precision target was tried first and did not transfer from
    # validation to test repositories, so the band is defined by rank, not precision.
    uncertain = best_f1_threshold(yva, pva)
    high = float(np.quantile(pva, 0.95))
    if high <= uncertain:
        high = min(0.95, uncertain + 0.05)

    config_idx = FEATURES.index("path_config_files")
    baselines = {
        "majority_class": binary_metrics(yte, np.zeros_like(yte)),
        "config_files_touched_rule": binary_metrics(yte, (Xte[:, config_idx] > 0).astype(int)),
    }
    model_test = score_metrics(yte, pte, uncertain)
    model_test_high = score_metrics(yte, pte, high)
    per_repo_auc = {}
    for repo in sorted(TEST_REPOS):
        mask = np.array([r["repo"] == repo for r in split["test"]])
        if len(set(yte[mask])) > 1:
            per_repo_auc[repo] = score_metrics(yte[mask], pte[mask], uncertain)["auc"]
    median_repo_auc = float(np.median(list(per_repo_auc.values())))
    # Promotion needs more than a pooled win: pooled AUC can come from telling repositories
    # apart rather than telling commits apart, so the median per-repository AUC must also
    # show real within-project ranking.
    beats = (model_test["f1"] > baselines["config_files_touched_rule"]["f1"]
             and model_test["f1"] > baselines["majority_class"]["f1"]
             and (model_test["auc"] or 0) > 0.6
             and median_repo_auc >= 0.55)

    weights = {
        "modelId": "juriscore.drift-risk.local-logistic",
        "modelVersion": "1.0.0" if beats else "1.0.0-unpromoted",
        "placeholder": False,
        "note": ("Fitted by ml/train_drift.py (L2 logistic regression, seed 7) on mined commits from "
                 "permissively licensed repositories listed in ml/data/SOURCES.md; repository-level "
                 "held-out evaluation in docs/PREDICTIVE_DRIFT_RISK.md."),
        "featuresVersion": "drift-features.v1",
        "maturity": "benchmark" if beats else "target",
        "intercept": round(model.intercept, 6),
        "coefficients": {name: round(float(w), 6) for name, w in zip(FEATURES, model.coefficients)},
        "bands": {"uncertain": round(uncertain, 4), "high": round(high, 4)},
    }
    write_json(args.out_weights, weights)

    metrics = {
        "rows": {k: {"n": len(v), "positives": int(sum(r["label"] for r in v))} for k, v in split.items()},
        "repos": {"train": sorted({r["repo"] for r in split["train"]}), "val": sorted(VAL_REPOS),
                  "test": sorted(TEST_REPOS)},
        "C_selection": grid, "C": C,
        "bands": weights["bands"],
        "test": {"model_at_uncertain": model_test, "model_at_high": model_test_high, **baselines},
        "test_by_repo": {
            repo: score_metrics(yte[mask], pte[mask], uncertain)
            for repo in sorted(TEST_REPOS)
            for mask in [np.array([r["repo"] == repo for r in split["test"]])]
            if len(set(yte[mask])) > 1
        },
        "calibration_test": reliability(yte, pte),
        "promoted": beats,
        "per_repo_auc_test": per_repo_auc,
        "median_repo_auc_test": round(median_repo_auc, 4),
        "rows_sha256": {os.path.basename(p): sha256_file(p) for p in sorted(glob.glob(os.path.join(args.rows, "*.jsonl")))},
    }
    write_json(args.out_metrics, metrics)
    print(json.dumps({"C": C, "bands": weights["bands"], "test": metrics["test"], "ece": metrics["calibration_test"]["ece"],
                      "per_repo_auc": per_repo_auc, "median_repo_auc": round(median_repo_auc, 4), "promoted": beats}, indent=1))


if __name__ == "__main__":
    main()
