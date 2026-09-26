"""Fits the Veil residual-exposure predictor (V-B). Dev-only.

Rows come from `bun scripts/extract-exposure-features.ts`, which runs the app's own Veil
engine, feature extractor and heuristic residual rule. Splits hold out whole datasets.

Promotion to "benchmark" requires, on the held-out test split:
  * F1 above the majority-class baseline, and
  * F1 above the heuristic residual rule, with recall no more than 5 points below it
    (owner requirement, 2026-09-26).

Usage: python ml/train_exposure.py --rows ml/data/work/exposure-rows.jsonl \
         --out-weights src/lib/juriscore/predict/exposure-weights.json --out-metrics ml/data/exposure-metrics.json
"""

from __future__ import annotations

import argparse
import json

import numpy as np

from common import (SEED, best_f1_threshold, binary_metrics, fit, reliability, score_metrics, select_C,
                    sha256_file, write_json)

FEATURES = [
    "max_span_score", "secret_shapes", "assigned_secrets", "high_entropy_tokens", "card_numbers",
    "network_identifiers", "labelled_identifiers", "prompt_attacks", "entropy_density", "redaction_density",
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", required=True)
    parser.add_argument("--out-weights", required=True)
    parser.add_argument("--out-metrics", required=True)
    args = parser.parse_args()
    np.random.seed(SEED)

    with open(args.rows, encoding="utf-8") as handle:
        rows = [json.loads(line) for line in handle if line.strip()]
    split = {k: [r for r in rows if r["split"] == k] for k in ("train", "val", "test")}

    def arrays(sub):
        return (np.array([r["vector"] for r in sub], dtype=float), np.array([r["label"] for r in sub], dtype=int),
                np.array([r["rule"]["flagged"] for r in sub], dtype=int))

    (Xtr, ytr, _), (Xva, yva, _), (Xte, yte, rte) = (arrays(split[k]) for k in ("train", "val", "test"))
    C, grid = select_C(Xtr, ytr, Xva, yva)
    model = fit(Xtr, ytr, C)
    pva, pte = model.proba(Xva), model.proba(Xte)

    uncertain = best_f1_threshold(yva, pva)
    high = float(np.quantile(pva[yva == 1], 0.5)) if (yva == 1).any() else uncertain + 0.1
    if high <= uncertain:
        high = min(0.95, uncertain + 0.1)

    majority = int(ytr.mean() >= 0.5)
    baselines = {
        f"majority_class(predict {majority})": binary_metrics(yte, np.full_like(yte, majority)),
        "heuristic_residual_rule": binary_metrics(yte, rte),
    }
    model_test = score_metrics(yte, pte, uncertain)
    rule = baselines["heuristic_residual_rule"]
    maj = next(v for k, v in baselines.items() if k.startswith("majority"))
    promoted = (model_test["f1"] > maj["f1"] and model_test["f1"] > rule["f1"]
                and model_test["recall"] >= rule["recall"] - 0.05)

    by_source = {}
    for source in sorted({r["source"] for r in split["test"]}):
        mask = np.array([r["source"] == source for r in split["test"]])
        entry = binary_metrics(yte[mask], (pte[mask] >= uncertain).astype(int))
        entry["rule"] = binary_metrics(yte[mask], rte[mask])
        entry["positive_rate"] = round(float(yte[mask].mean()), 3)
        by_source[source] = entry

    weights = {
        "modelId": "juriscore.residual-exposure.local-logistic",
        "modelVersion": "1.0.0" if promoted else "1.0.0-unpromoted",
        "placeholder": False,
        "note": ("Fitted by ml/train_exposure.py (L2 logistic regression, seed 7) on the training-OK datasets "
                 "in ml/data/SOURCES.md, labelled by running JurisCore's Veil engine; dataset-level held-out "
                 "evaluation in docs/RESIDUAL_EXPOSURE.md."),
        "featuresVersion": "exposure-features.v1",
        "maturity": "benchmark" if promoted else "synthetic",
        "intercept": round(model.intercept, 6),
        "coefficients": {name: round(float(w), 6) for name, w in zip(FEATURES, model.coefficients)},
        "bands": {"uncertain": round(uncertain, 4), "high": round(high, 4)},
    }
    write_json(args.out_weights, weights)
    metrics = {
        "rows": {k: {"n": len(v), "positives": int(sum(r["label"] for r in v))} for k, v in split.items()},
        "sources": {k: sorted({r["source"] for r in v}) for k, v in split.items()},
        "C_selection": grid, "C": C, "bands": weights["bands"],
        "test": {"model": model_test, **baselines},
        "test_by_source": by_source,
        "calibration_test": reliability(yte, pte),
        "promoted": promoted,
        "rows_sha256": sha256_file(args.rows),
    }
    write_json(args.out_metrics, metrics)
    print(json.dumps({"C": C, "bands": weights["bands"], "test": metrics["test"],
                      "ece": metrics["calibration_test"]["ece"], "promoted": promoted}, indent=1))


if __name__ == "__main__":
    main()
