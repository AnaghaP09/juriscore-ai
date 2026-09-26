"""Shared fitting and evaluation for JurisCore's local predictors (dev-only, never shipped).

Features come from the app's own TypeScript extractors; this module only fits an
L2-regularised logistic regression and measures it. The fitted model is exported as a
plain intercept + one coefficient per feature over the RAW feature values (standardisation
is folded into the coefficients), so the app's existing dot-product-and-sigmoid scorer
reproduces it exactly.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score

SEED = 7


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


@dataclass
class Fitted:
    intercept: float
    coefficients: np.ndarray  # over raw features
    C: float

    def proba(self, X: np.ndarray) -> np.ndarray:
        z = X @ self.coefficients + self.intercept
        return 1.0 / (1.0 + np.exp(-z))


def fit(X: np.ndarray, y: np.ndarray, C: float) -> Fitted:
    mean = X.mean(axis=0)
    std = X.std(axis=0)
    std[std == 0] = 1.0
    model = LogisticRegression(C=C, l1_ratio=0, solver="lbfgs", max_iter=5000, random_state=SEED)
    model.fit((X - mean) / std, y)
    w = model.coef_[0] / std
    b = float(model.intercept_[0] - np.sum(model.coef_[0] * mean / std))
    return Fitted(intercept=b, coefficients=w, C=C)


def binary_metrics(y: np.ndarray, flag: np.ndarray) -> dict:
    tp = int(np.sum((flag == 1) & (y == 1)))
    fp = int(np.sum((flag == 1) & (y == 0)))
    fn = int(np.sum((flag == 0) & (y == 1)))
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"precision": round(precision, 4), "recall": round(recall, 4), "f1": round(f1, 4),
            "flagged": int(flag.sum()), "n": int(len(y))}


def score_metrics(y: np.ndarray, p: np.ndarray, threshold: float) -> dict:
    out = binary_metrics(y, (p >= threshold).astype(int))
    out["auc"] = round(float(roc_auc_score(y, p)), 4) if len(set(y)) > 1 else None
    out["pr_auc"] = round(float(average_precision_score(y, p)), 4) if len(set(y)) > 1 else None
    out["threshold"] = round(threshold, 4)
    return out


def reliability(y: np.ndarray, p: np.ndarray, bins: int = 10) -> dict:
    edges = np.linspace(0, 1, bins + 1)
    rows, ece = [], 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        mask = (p >= lo) & (p < hi if hi < 1 else p <= hi)
        if mask.sum() == 0:
            continue
        predicted, observed = float(p[mask].mean()), float(y[mask].mean())
        ece += mask.sum() / len(y) * abs(predicted - observed)
        rows.append({"bin": f"{lo:.1f}-{hi:.1f}", "n": int(mask.sum()),
                     "mean_predicted": round(predicted, 3), "observed_rate": round(observed, 3)})
    return {"ece": round(float(ece), 4), "bins": rows}


def best_f1_threshold(y: np.ndarray, p: np.ndarray) -> float:
    candidates = np.unique(np.round(p, 4))
    best, best_t = -1.0, 0.5
    for t in candidates:
        f1 = binary_metrics(y, (p >= t).astype(int))["f1"]
        if f1 > best:
            best, best_t = f1, float(t)
    return best_t


def precision_threshold(y: np.ndarray, p: np.ndarray, target: float, floor: float) -> float | None:
    """Smallest threshold >= floor whose flagged set reaches the target precision."""
    for t in np.unique(np.round(p, 4)):
        if t < floor:
            continue
        m = binary_metrics(y, (p >= t).astype(int))
        if m["flagged"] >= 10 and m["precision"] >= target:
            return float(t)
    return None


def select_C(Xtr, ytr, Xva, yva, grid=(0.01, 0.03, 0.1, 0.3, 1.0, 3.0)) -> tuple[float, list]:
    results = []
    for C in grid:
        fitted = fit(Xtr, ytr, C)
        p = fitted.proba(Xva)
        results.append({"C": C, "val_pr_auc": round(float(average_precision_score(yva, p)), 4),
                        "val_auc": round(float(roc_auc_score(yva, p)), 4)})
    best = max(results, key=lambda r: (r["val_pr_auc"], -r["C"]))
    return best["C"], results


def write_json(path: str, data) -> None:
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")
