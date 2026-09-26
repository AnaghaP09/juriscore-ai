"""Gathers raw residual-exposure examples from the approved, training-OK sources (V-B).

Dev-only. Writes one JSON object per line: {source, split, kind, text, values}.
  kind   "pii" | "secret" | "injection" | "benign"
  values the ground-truth sensitive strings for pii/secret examples (from the dataset's own
         annotations), used afterwards to decide whether Veil left any of them behind.
The residual label itself is decided in TypeScript (scripts/extract-exposure-features.ts),
after running the app's real Veil engine, so labels and features share one code path.

Splits hold out whole datasets / repositories, so test metrics measure transfer to data
the model never saw a sibling of.
"""

from __future__ import annotations

import ast
import csv
import glob
import json
import os
import random
import re
import subprocess
import sys

import pyarrow.parquet as pq

SEED = 7
RAW = os.path.join(os.path.dirname(__file__), "data", "raw")
HF = os.path.join(RAW, "hf")
csv.field_size_limit(sys.maxsize if sys.maxsize < 2**31 else 2**31 - 1)

# PII types worth protecting. Generic context (company, country, city, dates, times,
# URLs) is excluded: Veil is not meant to remove it, so leaving it is not a miss.
SENSITIVE_TYPE = re.compile(
    r"name|email|phone|ssn|social|address|birth|account|iban|bban|card|cvv|pin|password|"
    r"key|token|secret|passport|licen[cs]e|medical|record|tax|routing|swift|customer_id|"
    r"employee_id|national|ip_address|bank|credential|username|driver",
    re.I,
)
EXCLUDED_TYPE = re.compile(r"company|country|city|^date$|^time$|url|organization|state", re.I)

TEST_REPOS = {"stripe__stripe-go", "docker__compose", "pallets__flask", "jestjs__jest"}
VAL_REPOS = {"urllib3__urllib3", "cli__cli", "moov-io__ach"}


def pq_rows(path: str):
    return pq.read_table(path).to_pylist()


def sensitive(label: str) -> bool:
    return bool(SENSITIVE_TYPE.search(label)) and not EXCLUDED_TYPE.search(label)


def clean_values(values) -> list[str]:
    out = []
    for value in values:
        value = str(value).strip()
        if len(value) >= 4 and value not in out:
            out.append(value)
    return out


def gretel_finance(path: str, split: str, limit: int, rng: random.Random):
    rows = [r for r in pq_rows(path) if r.get("language") == "English"]
    rng.shuffle(rows)
    for row in rows[:limit]:
        text = row["generated_text"]
        spans = json.loads(row["pii_spans"] or "[]")
        values = clean_values(text[s["start"]:s["end"]] for s in spans if sensitive(s["label"]))
        yield {"source": "gretelai/synthetic_pii_finance_multilingual", "split": split,
               "kind": "pii" if values else "benign", "text": text, "values": values}


def gretel_masking(path: str, split: str, limit: int, rng: random.Random):
    rows = pq_rows(path)
    rng.shuffle(rows)
    for row in rows[:limit]:
        entities = ast.literal_eval(row["entities"]) if row["entities"] else []
        values = clean_values(e["entity"] for e in entities if any(sensitive(t) for t in e.get("types", [])))
        yield {"source": "gretelai/gretel-pii-masking-en-v1", "split": split,
               "kind": "pii" if values else "benign", "text": row["text"], "values": values}


def parquet_prompts(source: str, pattern: str, split: str, label_of):
    for path in sorted(glob.glob(pattern)):
        for row in pq_rows(path):
            yield {"source": source, "split": split, "kind": label_of(row), "text": row["text"], "values": []}


def jackhhao(split: str):
    path = os.path.join(HF, "jackhhao__jailbreak-classification", "default", "jailbreak_dataset_full.csv")
    with open(path, encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            yield {"source": "jackhhao/jailbreak-classification", "split": split,
                   "kind": "injection" if row["type"] == "jailbreak" else "benign",
                   "text": row["prompt"], "values": []}


def spml(split: str, limit: int, rng: random.Random):
    path = os.path.join(HF, "reshabhs__SPML_Chatbot_Prompt_Injection", "spml_prompt_injection.csv")
    with open(path, encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    rng.shuffle(rows)
    for row in rows[:limit]:
        yield {"source": "reshabhs/SPML_Chatbot_Prompt_Injection", "split": split,
               "kind": "injection" if row["Prompt injection"].strip() == "1" else "benign",
               "text": row["User Prompt"], "values": []}


ASSIGNED_LITERAL = re.compile(r"""[:=]\s*(?:['"])([^'"\s]{8,})(?:['"])|[:=]\s*([^\s'"#]{12,})""")


def secret_files(source: str, root: str, split: str):
    """Fixture files that exist to contain secrets. Each assigned literal is a ground-truth
    value; a file is one example, so Veil sees realistic multi-line context."""
    for path in sorted(glob.glob(os.path.join(root, "**", "*"), recursive=True)):
        if not os.path.isfile(path) or os.path.getsize(path) > 200_000:
            continue
        try:
            text = open(path, encoding="utf-8").read()
        except (UnicodeDecodeError, OSError):
            continue
        values = []
        for line in text.splitlines():
            if line.strip().startswith(("#", "//")):
                continue
            for match in ASSIGNED_LITERAL.finditer(line):
                values.append(match.group(1) or match.group(2))
        values = clean_values(values)
        if values:
            yield {"source": source, "split": split, "kind": "secret", "text": text[:20_000],
                   "values": values[:200]}


def doc_paragraphs(limit_per_repo: int, rng: random.Random):
    """Clean negatives: README/doc paragraphs from the mined, permissively licensed repos."""
    for repo_dir in sorted(glob.glob(os.path.join(RAW, "repos", "*"))):
        name = os.path.basename(repo_dir)
        split = "test" if name in TEST_REPOS else "val" if name in VAL_REPOS else "train"
        files = subprocess.run(["git", "-C", repo_dir, "ls-tree", "-r", "--name-only", "pinned"],
                               capture_output=True, text=True).stdout.split()
        docs = [f for f in files if re.search(r"(^|/)(readme|docs?/).*\.(md|rst)$|^readme", f, re.I)][:40]
        paragraphs = []
        for doc in docs:
            body = subprocess.run(["git", "-C", repo_dir, "show", f"pinned:{doc}"],
                                  capture_output=True, text=True, encoding="utf-8", errors="replace").stdout
            paragraphs.extend(p.strip() for p in re.split(r"\n\s*\n", body) if 80 <= len(p.strip()) <= 2000)
        rng.shuffle(paragraphs)
        for paragraph in paragraphs[:limit_per_repo]:
            yield {"source": f"docs:{name.replace('__', '/')}", "split": split, "kind": "benign",
                   "text": paragraph, "values": []}


def main() -> None:
    rng = random.Random(SEED)
    out_path = os.path.join(os.path.dirname(__file__), "data", "work", "exposure-raw.jsonl")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    fin = os.path.join(HF, "gretelai__synthetic_pii_finance_multilingual", "data")
    mask = os.path.join(HF, "gretelai__gretel-pii-masking-en-v1", "data")
    deep = os.path.join(HF, "deepset__prompt-injections", "data")
    gand = os.path.join(HF, "Lakera__gandalf_ignore_instructions", "data")
    generators = [
        # train
        gretel_finance(os.path.join(fin, "English_train-00000-of-00001.parquet"), "train", 3000, rng),
        parquet_prompts("deepset/prompt-injections", os.path.join(deep, "train-*.parquet"), "train",
                        lambda r: "injection" if str(r["label"]) == "1" else "benign"),
        parquet_prompts("Lakera/gandalf_ignore_instructions", os.path.join(gand, "train-*.parquet"), "train",
                        lambda r: "injection"),
        spml("train", 3000, rng),
        secret_files("gitleaks/gitleaks testdata", os.path.join(RAW, "secrets", "gitleaks__gitleaks", "testdata"), "train"),
        # validation
        gretel_finance(os.path.join(fin, "English_test-00000-of-00001.parquet"), "val", 800, rng),
        parquet_prompts("deepset/prompt-injections", os.path.join(deep, "test-*.parquet"), "val",
                        lambda r: "injection" if str(r["label"]) == "1" else "benign"),
        parquet_prompts("Lakera/gandalf_ignore_instructions", os.path.join(gand, "validation-*.parquet"), "val",
                        lambda r: "injection"),
        # held-out test: datasets never seen in training or validation
        gretel_masking(os.path.join(mask, "test-00000-of-00001.parquet"), "test", 2000, rng),
        jackhhao("test"),
        parquet_prompts("Lakera/gandalf_ignore_instructions", os.path.join(gand, "test-*.parquet"), "test",
                        lambda r: "injection"),
        secret_files("Yelp/detect-secrets test_data", os.path.join(RAW, "secrets", "Yelp__detect-secrets", "test_data"), "test"),
        # clean negatives from repository docs, split by repository like Plumb
        doc_paragraphs(120, rng),
    ]
    counts: dict[tuple, int] = {}
    with open(out_path, "w", encoding="utf-8", newline="\n") as out:
        for generator in generators:
            for row in generator:
                if not row["text"] or not row["text"].strip():
                    continue
                out.write(json.dumps(row, ensure_ascii=False) + "\n")
                key = (row["split"], row["kind"])
                counts[key] = counts.get(key, 0) + 1
    for key in sorted(counts):
        print(key, counts[key])


if __name__ == "__main__":
    main()
