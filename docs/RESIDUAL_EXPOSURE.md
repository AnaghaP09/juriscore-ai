# Residual exposure (Veil): training, evaluation and the baseline rule

**Status.** The product still ships the **labelled placeholder weights** (`src/lib/juriscore/predict/exposure-weights.json`,
`placeholder: true`, maturity `target`). The first fitted model did **not** meet the promotion bar. Its weights and
metrics are kept in `ml/data/weights.exposure.fitted.json` and `ml/data/exposure-metrics.json`.

Both the model and the baseline rule are advisory. Neither ever changes Veil's verdict (`scripts/check-ml.ts` checks
this).

## What it predicts

The question is: *after Veil has protected the text, is anything sensitive still left?* The predictor sees only
Veil's sanitized output. Labels come from running JurisCore's real Veil engine (`protectText`, with the default active
policies and the Veil page's profile) on each example:

| Kind of example | Label 1 (residual) when |
|---|---|
| personal data / secret | a ground-truth sensitive value from the dataset's own annotations survives sanitization verbatim |
| prompt injection | Veil raised no prompt-attack finding for it |
| benign text | never (always 0) |

Generic context such as company names, countries, cities, plain dates and URLs is not counted as sensitive.

## Data

The sources are all training-OK and pinned, as listed in `ml/data/SOURCES.md`. Whole datasets are held out for
testing.

| Split | Sources | Examples | Residual |
|---|---|---|---|
| train | gretel synthetic PII finance (English), deepset prompt-injections, Lakera gandalf, SPML, gitleaks fixtures, docs from 8 repos | 8,260 | 5,212 |
| validation | gretel finance (test file), deepset (test), gandalf (validation), docs from 3 repos | 1,387 | 701 |
| held-out test | gretel-pii-masking-en-v1, jackhhao jailbreak-classification, gandalf (test), detect-secrets fixtures, docs from 4 repos | 4,594 | 2,616 |

**A finding worth knowing.** Veil's fixed detectors leave most prose-embedded personal data behind. In the held-out
PII set, 93% of documents still contain at least one annotated name, address or ID after protection. It also misses
most novel injection phrasings. The residual-exposure layer exists to cover exactly this gap.

## The heuristic residual rule (baseline)

The rule's code is in `src/lib/juriscore/predict/exposure-rule.ts`, versioned `residual-rule.v1`. It runs on the same
sanitized text as the model. It flags the text if **any** of these still fires outside Veil's own placeholders:

1. **High-entropy token:** length ≥ 20, Shannon entropy ≥ 3.5 bits/char, containing both letters and digits.
2. **Credential assignment:** `(password|passwd|secret|token|api[_-]?key|credential)\s*[:=]\s*\S{8,}`, case-insensitive.
3. **Prompt-attack phrase** from a fixed list:
   - `ignore (all )?(the )?(previous|prior|above) (instructions|rules|prompts)`
   - `disregard (the |your )?(system prompt|previous instructions|instructions)`
   - `you are now`
   - `reveal (your |the )?(system )?prompt`
   - `developer mode`
4. **Card-like number:** a run of 13–19 digits that passes the Luhn check.

In the product, the Veil page's Residual exposure card shows it as the **Baseline rule** row:
- flagged or not, and which rules fired
- the matching text, highlighted and labelled "rule"
- whether the model and the rule agree

Each Veil run records only the flag and the rule ids in the device history. The matched text is never recorded.

## Results on held-out data

| | Precision | Recall | F1 | AUC |
|---|---|---|---|---|
| Majority class (always "residual") | 0.569 | 1.000 | 0.726 | — |
| Heuristic residual rule | 0.754 | 0.053 | 0.099 | single operating point |
| **Fitted model** (at the uncertain band 0.387) | 0.561 | 0.940 | 0.703 | 0.551 |

Results by held-out source, at the uncertain band:

| Source | Residual rate | Model F1 | Rule F1 |
|---|---|---|---|
| gretel-pii-masking-en-v1 | 0.93 | 0.93 | 0.03 |
| Lakera gandalf (test) | 0.82 | 0.96 | 0.20 |
| detect-secrets fixtures | 1.00 | 0.97 | 0.89 |
| jackhhao jailbreak-classification | 0.32 | 0.49 | 0.22 |

Calibration error is 0.23: poorly calibrated.

**Why it was not promoted.** The model beats the rule by a wide margin (F1 0.70 vs 0.10, recall 0.94 vs 0.05). It
does **not** beat the majority-class baseline (0.726), and its AUC is 0.55. In practice it learned the training base
rate: it rates **99.9% of clean repository documentation** at or above the uncertain band. Shipping it would turn
nearly every Veil run amber, so the placeholder, which flags 8% of clean text, stays.

The v1 features describe secret and attack *shapes* (entropy, assignments, card numbers, phrases). They cannot see a
person's name or a street address in prose, which is most of the residual data.

## Limits and next steps

- **v2 features** should add signals for prose PII:
  - capitalised name patterns next to identity words
  - address-shaped phrases
  - number patterns labelled by nearby words
- **Balanced training** or a per-source intercept would stop the model from learning the base rate.
- **Owner decision:** none needed to keep the current behaviour. The rule is already live as a reference row on the
  Veil card.
