# Training and evaluation sources

Every source that influenced a fitted artifact is listed here with its license and the exact version used. The
source list was approved by the product owner on 2026-09-26, from `juriscore-loop/DATA-SOURCES.md`.

The license rule is simple: only MIT, Apache-2.0, BSD-2/3, ISC, CC0 or CC-BY-4.0 sources may be fitted on. Nothing
marked evaluation-only was downloaded or used.

Raw clones and downloads live in `ml/data/raw/`, which is gitignored and never committed. The committed artifacts are
listed below:

| Path | Contents |
|---|---|
| `ml/data/features/` | Numeric feature rows only, no text |
| `ml/data/features.sha256` | Checksums for the feature rows |
| `ml/data/*-metrics.json` | Evaluation metrics |
| `ml/data/weights.*.fitted.json` | Fitted weights |

## Plumb drift risk (Phase B): repositories

Each repository was fetched at the pinned commit with `git fetch --depth 1000`. The last 1,000 non-merge commits were
mined with `git log -p -U0`. Split column: T = train, V = validation, H = held-out test.

| Repository | License | Pinned commit | Split |
|---|---|---|---|
| [stripe/stripe-go](https://github.com/stripe/stripe-go) | MIT | `64369fdd0acbe19f9ddf52b9a29243cb0db47619` | H |
| [stripe/stripe-node](https://github.com/stripe/stripe-node) | MIT | `d2b844a437ba5f3c76246502e39295468b2652de` | T |
| [juspay/hyperswitch](https://github.com/juspay/hyperswitch) | Apache-2.0 | `9b3b15f840b1b2bb8b199fd5af51a99947368c01` | T |
| [moov-io/ach](https://github.com/moov-io/ach) | Apache-2.0 | `7ee7ad03d7342e1f651c32db22fc8168c2b97cce` | V |
| [docker/compose](https://github.com/docker/compose) | Apache-2.0 | `32bddfc4c693dd1b9ed8633ff2adb2d511a07ee1` | H |
| [cli/cli](https://github.com/cli/cli) | MIT | `9b031151a825bda919203c5202876a725d637368` | V |
| [psf/requests](https://github.com/psf/requests) | Apache-2.0 | `611c6162cbc4ac2020a2f91c7cfa4f3abf9bbb60` | T |
| [urllib3/urllib3](https://github.com/urllib3/urllib3) | MIT | `ed0ed075c6b93f7c515ebd3abe9a7248507ef8c5` | V |
| [encode/httpx](https://github.com/encode/httpx) | BSD-3-Clause | `b5addb64f0161ff6bfe94c124ef76f6a1fba5254` | T |
| [pallets/flask](https://github.com/pallets/flask) | BSD-3-Clause | `d73fa1cdcbd8b1465c151db8924ba58b1dd14e35` | H |
| [expressjs/express](https://github.com/expressjs/express) | MIT | `9a34acf03cb818ff3f8bc40e44176e277a25cbb9` | T |
| [fastapi/fastapi](https://github.com/fastapi/fastapi) | MIT | `192b12197eb04c2b4a691cce7d87261b21716714` | T |
| [jestjs/jest](https://github.com/jestjs/jest) | MIT | `202dd8a14777c270607c2416bd5034c3c0abc984` | H |
| [traefik/traefik](https://github.com/traefik/traefik) | MIT | `f08964179357f5170d1bc515213b16e120d02e6d` | T |
| [pypa/pip](https://github.com/pypa/pip) | MIT | `a7002c9771a6c3f0317a4e6b9fbdcd22e643f7b6` | T |

README and docs paragraphs from the same repositories, at the same commits, were also used as clean (negative)
examples for Veil. They follow the same split.

## Veil residual exposure (V-B): datasets

The "Pinned revision" column is the Hugging Face revision or the git commit.

| Source | License | Pinned revision | Files used | Split |
|---|---|---|---|---|
| [gretelai/synthetic_pii_finance_multilingual](https://huggingface.co/datasets/gretelai/synthetic_pii_finance_multilingual) | Apache-2.0 | `7b844d16738527a04264f50214cb426a4cea0897` | `English_train` (3,000 sampled), `English_test` (800 sampled) | train / val |
| [gretelai/gretel-pii-masking-en-v1](https://huggingface.co/datasets/gretelai/gretel-pii-masking-en-v1) | Apache-2.0 | `e06eb1499ca8d54470f085021cd8e54f9efac7fd` | `test` (2,000 sampled) | held-out test |
| [deepset/prompt-injections](https://huggingface.co/datasets/deepset/prompt-injections) | Apache-2.0 | `4f61ecb038e9c3fb77e21034b22511b523772cdd` | `train`, `test` | train / val |
| [Lakera/gandalf_ignore_instructions](https://huggingface.co/datasets/Lakera/gandalf_ignore_instructions) | MIT | `04737b65e90a6794ec227012e4a255a7def6344b` | `train`, `validation`, `test` | train / val / test |
| [jackhhao/jailbreak-classification](https://huggingface.co/datasets/jackhhao/jailbreak-classification) | Apache-2.0 | `2f2ceeb39658696fd3f462403562b6eea5306287` | `default/jailbreak_dataset_full.csv` | held-out test |
| [reshabhs/SPML_Chatbot_Prompt_Injection](https://huggingface.co/datasets/reshabhs/SPML_Chatbot_Prompt_Injection) | MIT | `02ce8084e979bc7d4c24ee35d22ecb7f2db96ff5` | `spml_prompt_injection.csv` (3,000 sampled, `User Prompt` column) | train |
| [gitleaks/gitleaks](https://github.com/gitleaks/gitleaks) `testdata/` | MIT | `b58d3f102cf3a2c84cb7f923d05c25c9b1aed84b` | fixture files with assigned secret literals | train |
| [Yelp/detect-secrets](https://github.com/Yelp/detect-secrets) `test_data/` | Apache-2.0 | `5e141933554a0b74e7341841f318be21e895339c` | fixture files with assigned secret literals | held-out test |

All sampling uses seed 7 (`ml/prepare_exposure.py`).

## Approved but not used in this run

| Source | Why not used |
|---|---|
| nvidia/Nemotron-PII (CC-BY-4.0) | 300 MB of parquet; gretel's PII sets already cover the same kind of data. If a later run uses it, attribution is required: "NVIDIA Nemotron-PII, licensed CC-BY-4.0". |
| beki/privy (MIT) | Not needed for this run. |
| microsoft/presidio-research (MIT) | Not needed for this run. |
| axios/axios, express-rate-limit (MIT) | Not needed for this run. |

## Evaluation-only sources: never downloaded, never fitted on

- ai4privacy
- TrustAIRLab in-the-wild prompts
- xTRam1 safe-guard
- Samsung/CredData
- trufflehog (AGPL-3.0)
- hashicorp/terraform (BUSL-1.1)
- JailbreakBench/JBB-Behaviors (kept for a future external benchmark)
