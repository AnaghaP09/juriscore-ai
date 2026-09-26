import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  persistedReceiptSchema,
  validationReceiptSchema,
  type PersistedReceipt,
  type ValidationReceipt,
} from "../src/lib/juriscore/core/contracts";
import {
  createReceipt,
  decodePolicyVersion,
  encodePolicyVersion,
  receiptDigestVersion,
  serializeReceipt,
  toPersistedReceipt,
} from "../src/lib/juriscore/core/receipts";
import { receiptDomainResolver, receiptDomains } from "../src/lib/juriscore/core/receipt-domains";
import {
  BUILT_IN_POLICIES,
  policyDomain,
  type PolicyDefinition,
} from "../src/lib/juriscore/policies/catalog";
import {
  HISTORY_NOT_SAVED_NOTE,
  RECEIPT_HISTORY_LIMIT,
  createReceiptStore,
  receiptsToCsv,
  receiptsToJson,
} from "../src/lib/juriscore/core/receipt-store";
import {
  writeReceiptToFolder,
  type ReceiptFolderHandle,
} from "../src/lib/juriscore/core/receipt-folder";
import {
  verificationMode,
  verifyPlumbSources,
  verifyVeilText,
} from "../src/lib/juriscore/core/receipt-verify";
import { createRunFinalizer } from "../src/lib/juriscore/core/run-finalizer";
import { createSafeStorage } from "../src/lib/juriscore/core/safe-storage";
import { plumbReportMarkdown, veilReportText } from "../src/lib/juriscore/core/reports";
import { protectText } from "../src/lib/juriscore/veil/engine";
import { veilReceiptInput } from "../src/lib/juriscore/veil/receipt";
import { compareClaims } from "../src/lib/juriscore/plumb/engine";
import { plumbReceiptInput, plumbSourceDigests } from "../src/lib/juriscore/plumb/receipt";
import {
  BUILT_IN_SUBJECTS,
  claimsFromDiff,
  claimsFromDocument,
  documentSentences,
  parseUnifiedDiff,
} from "../src/lib/juriscore/plumb/sources";
import {
  FakeIndexedDB,
  FakeLocalStorage,
  ThrowingLocalStorage,
  failingIndexedDB,
} from "./fixtures/fake-storage";

const asFactory = (fake: unknown) => fake as IDBFactory;
const POLICIES = [{ id: "pii-baseline", version: "JurisCore 2026.07" }];

function iso(index: number) {
  return new Date(Date.UTC(2026, 8, 1, 0, 0, index)).toISOString();
}

async function veilReceipt(raw: string, createdAt: string) {
  const run = protectText(raw, { profile: "all_sensitive", strategy: "redact" });
  return createReceipt({ ...veilReceiptInput(run, raw, POLICIES), createdAt });
}

// ---------------------------------------------------------------------------
// Plumb fixtures: the workbench's own extraction path, with load-time versions.
// ---------------------------------------------------------------------------

const DIFF = `diff --git a/src/payments.ts b/src/payments.ts
index 337d924..e6dca5a 100644
--- a/src/payments.ts
+++ b/src/payments.ts
@@ -40,7 +40,7 @@
 export const payments = {
-  kycThreshold: 10_000,
+  kycThreshold: 25_000,
   currency: "USD",
-  crossBorderFeeBps: 100, // 1.0%
+  crossBorderFeeBps: 250, // 2.5%
 };`;

const DOC_NAME = "sec-10k-excerpt.txt";
const DOC = [
  "Our Know-Your-Customer program applies enhanced due diligence to any single transaction exceeding $10,000.",
  "Cross-border remittance fees disclosed to retail customers remain capped at 1.0% of principal.",
  "The Company maintains independent oversight of all pricing changes.",
].join("\n");

function workbenchRun(diff: string, doc: string, loadedAt: string) {
  const file = parseUnifiedDiff(diff)[0];
  const authorities = claimsFromDiff(file, BUILT_IN_SUBJECTS, loadedAt);
  const assertions = claimsFromDocument(documentSentences(doc), BUILT_IN_SUBJECTS, {
    sourceId: DOC_NAME,
    sourceVersion: loadedAt,
  });
  return { authorities, assertions, result: compareClaims(authorities, assertions) };
}

async function plumbReceipt(diff: string, doc: string, createdAt: string) {
  const run = workbenchRun(diff, doc, createdAt);
  const digests = await plumbSourceDigests({ diff, documents: [{ name: DOC_NAME, text: doc }] });
  return createReceipt({
    ...plumbReceiptInput(run.result, run, POLICIES, digests),
    createdAt,
  });
}

// ---------------------------------------------------------------------------
// R-a. Run boundaries
// ---------------------------------------------------------------------------
{
  const idb = new FakeIndexedDB();
  const store = createReceiptStore({ indexedDB: asFactory(idb), broadcast: false });

  // Plumb: a completed check stores its receipt with no download, and a reload lists it.
  const plumb = await plumbReceipt(DIFF, DOC, iso(1));
  await store.addReceipt(plumb);
  const reloaded = createReceiptStore({ indexedDB: asFactory(idb), broadcast: false });
  const listed = await reloaded.listReceipts();
  assert.deepEqual(
    listed.items.map((item) => item.id),
    [plumb.id],
  );

  // Veil: typing never finalizes (the workbench only re-runs protectText per keystroke);
  // Copy creates one receipt; Copy again and Download reuse it.
  const finalize = createRunFinalizer<PersistedReceipt>();
  const raw = "Contact maya.patel@example.test about workspace acme-prod-4831.";
  for (const typed of ["C", "Co", raw]) protectText(typed, { profile: "all_sensitive" });
  assert.equal(await store.countReceipts({ module: "veil" }), 0);
  let builds = 0;
  const build = async () => {
    builds += 1;
    const created = await veilReceipt(raw, iso(2));
    return (await store.addReceipt(created)).receipt;
  };
  const key = JSON.stringify(["redact", "pii-baseline@JurisCore 2026.07", raw]);
  const [copied, copiedAgain] = await Promise.all([finalize(key, build), finalize(key, build)]);
  const downloaded = await finalize(key, build);
  assert.equal(builds, 1);
  assert.equal(await store.countReceipts({ module: "veil" }), 1);
  assert.ok(copied && copiedAgain && downloaded);
  assert.equal(copied, downloaded);
  const [stored] = (await store.listReceipts({ module: "veil" })).items;
  assert.equal(serializeReceipt(downloaded), JSON.stringify(stored, null, 2));

  // A failed build is forgotten, so the next action retries.
  const retry = createRunFinalizer<string>();
  assert.equal(await retry("k", async () => null), null);
  assert.equal(await retry("k", async () => "ok"), "ok");
  assert.equal(
    await retry("k", async () => {
      throw new Error("never called");
    }),
    "ok",
  );
}

// ---------------------------------------------------------------------------
// R-b. Allowlist: excerpt, nested unknown key, and top-level extras never persist.
// ---------------------------------------------------------------------------
{
  const CANARIES = ["CANARY-EXCERPT-7731", "CANARY-NESTED-5520", "CANARY-RAWINPUT-9044"];
  const clean = await veilReceipt("plain text", iso(3));
  const dirty = {
    ...clean,
    evidence: [
      {
        sourceId: "doc.txt",
        sourceVersion: "a".repeat(64),
        locator: "s1",
        excerpt: CANARIES[0],
        nested: { note: CANARIES[1] },
      },
    ],
    rawInput: CANARIES[2],
  } as unknown as ValidationReceipt;

  assert.equal(persistedReceiptSchema.safeParse(dirty).success, false);
  assert.equal(
    persistedReceiptSchema.safeParse({ ...toPersistedReceipt(clean), extra: 1 }).success,
    false,
  );

  const idb = new FakeIndexedDB();
  const store = createReceiptStore({ indexedDB: asFactory(idb), broadcast: false });
  await store.addReceipt(dirty);

  const folderFiles = new Map<string, string>();
  const folder: ReceiptFolderHandle = {
    name: "receipts",
    queryPermission: async () => "granted",
    getDirectoryHandle: async (name) => ({
      ...folder,
      name,
      getFileHandle: async (fileName) => ({
        createWritable: async () => ({
          write: async (data: string) => {
            folderFiles.set(`${name}/${fileName}`, data);
          },
          close: async () => undefined,
        }),
      }),
    }),
    getFileHandle: async () => {
      throw new Error("receipts are written under a module folder");
    },
  };
  const written = await writeReceiptToFolder(dirty, { handle: folder, fallback: () => undefined });
  assert.equal(written.ok, true);
  assert.equal(folderFiles.size, 1);
  assert.ok([...folderFiles.keys()][0].startsWith("veil/"));

  const exported = await store.exportReceipts();
  const outputs = {
    stored: idb.dump(),
    downloaded: serializeReceipt(dirty),
    folder: [...folderFiles.values()].join("\n"),
    csv: receiptsToCsv(exported),
    json: receiptsToJson(exported),
    csvDirect: receiptsToCsv([dirty as unknown as PersistedReceipt]),
  };
  for (const [output, bytes] of Object.entries(outputs)) {
    for (const canary of CANARIES) {
      assert.equal(bytes.includes(canary), false, `${output} contains ${canary}`);
    }
    assert.equal(bytes.includes("excerpt"), false, `${output} contains an excerpt key`);
  }
  // The stored record is still the receipt, minus what the allowlist drops.
  assert.equal(exported[0].id, clean.id);
  assert.equal(exported[0].evidence[0].locator, "s1");

  // A folder failure falls back to a download and says why.
  let fellBack = 0;
  const denied = async () => "denied" as const;
  const refused = await writeReceiptToFolder(clean, {
    handle: { ...folder, queryPermission: denied, requestPermission: denied },
    fallback: () => {
      fellBack += 1;
    },
  });
  assert.equal(refused.ok, false);
  assert.equal(fellBack, 1);
  assert.ok(!refused.ok && refused.downloaded && refused.reason.includes("Permission"));
}

// ---------------------------------------------------------------------------
// R-c. Retention: the newest 200 survive, and the trim is reported.
// ---------------------------------------------------------------------------
{
  const idb = new FakeIndexedDB();
  const store = createReceiptStore({ indexedDB: asFactory(idb), broadcast: false });
  const trimEvents: number[] = [];
  store.onChange((event) => {
    if (event.type === "added" && event.trimmed > 0) trimEvents.push(event.trimmed);
  });
  const ids: string[] = [];
  let trimmed = 0;
  for (let index = 0; index < RECEIPT_HISTORY_LIMIT + 5; index += 1) {
    const receipt = await veilReceipt(`input ${index}`, iso(100 + index));
    ids.push(receipt.id);
    trimmed += (await store.addReceipt(receipt)).trimmed;
  }
  assert.equal(trimmed, 5);
  assert.equal(
    trimEvents.reduce((sum, count) => sum + count, 0),
    5,
  );
  assert.equal(await store.countReceipts(), RECEIPT_HISTORY_LIMIT);
  const kept = new Set((await store.exportReceipts()).map((receipt) => receipt.id));
  for (const id of ids.slice(0, 5)) assert.equal(kept.has(id), false);
  for (const id of ids.slice(5)) assert.equal(kept.has(id), true);

  // The in-memory fallback applies the same limit.
  const memory = createReceiptStore({ indexedDB: null, broadcast: false, limit: 3 });
  let memoryTrimmed = 0;
  for (let index = 0; index < 5; index += 1) {
    memoryTrimmed += (await memory.addReceipt(await veilReceipt(`m${index}`, iso(index)))).trimmed;
  }
  assert.equal(memoryTrimmed, 2);
  assert.equal(await memory.countReceipts(), 3);
}

// ---------------------------------------------------------------------------
// R-d. Export covers every match across pages; search is case-insensitive.
// ---------------------------------------------------------------------------
{
  const store = createReceiptStore({ indexedDB: asFactory(new FakeIndexedDB()), broadcast: false });
  for (let index = 0; index < 120; index += 1) {
    const receipt =
      index % 3 === 0
        ? await plumbReceipt(DIFF, `${DOC}\nNote ${index}.`, iso(500 + index))
        : await veilReceipt(`veil ${index}`, iso(500 + index));
    await store.addReceipt(receipt);
  }
  const firstPage = await store.listReceipts({ offset: 0, limit: 50 });
  assert.equal(firstPage.items.length, 50);
  assert.equal(firstPage.total, 120);
  const lastPage = await store.listReceipts({ offset: 100, limit: 50 });
  assert.equal(lastPage.items.length, 20);
  assert.equal((await store.exportReceipts()).length, 120);
  assert.equal((await store.exportReceipts({ module: "veil" })).length, 80);
  assert.equal((await store.exportReceipts({ q: "RECEIPT.PLUMB" })).length, 40);
  assert.equal((await store.exportReceipts({ q: "PlUmB" })).length, 40);
  assert.equal((await store.exportReceipts({ q: "PII-BASELINE@JURISCORE" })).length, 120);
  const [one] = (await store.listReceipts({ offset: 7, limit: 1 })).items;
  assert.equal((await store.exportReceipts({ q: one.id.toUpperCase() })).length, 1);
  const csv = receiptsToCsv(await store.exportReceipts());
  assert.equal(csv.trim().split("\n").length, 121);
}

// ---------------------------------------------------------------------------
// R-e. Verification, per digest version.
// ---------------------------------------------------------------------------
{
  // Veil: the original input matches; one changed character does not.
  const raw = "Workspace acme-prod-4831, contact maya.patel@example.test.";
  const veil = toPersistedReceipt(await veilReceipt(raw, iso(1)));
  assert.equal(verificationMode(veil).kind, "veil-text");
  assert.equal(await verifyVeilText(veil, raw), "matches");
  assert.equal(await verifyVeilText(veil, raw.replace("4831", "4832")), "differs");

  // Plumb v2: the same sources loaded again later (new load times) verify on both digests.
  const plumb = toPersistedReceipt(await plumbReceipt(DIFF, DOC, iso(2)));
  assert.equal(plumb.digestVersion, "plumb.sources.v2");
  assert.equal(verificationMode(plumb).kind, "plumb-sources");
  const reloadedLater = await plumbReceipt(DIFF, DOC, iso(9999));
  assert.equal(reloadedLater.inputDigest, plumb.inputDigest);
  assert.equal(reloadedLater.sourceDigest, plumb.sourceDigest);
  const verify = (diff: string, doc: string) =>
    verifyPlumbSources(plumb, { diff, documents: [{ name: DOC_NAME, text: doc }] });
  assert.deepEqual(await verify(DIFF, DOC), { source: "matches", claims: "matches" });

  // A line inside an extracted claim: both differ.
  assert.deepEqual(await verify(DIFF, DOC.replace("1.0% of principal", "1.5% of principal")), {
    source: "differs",
    claims: "differs",
  });
  assert.deepEqual(await verify(DIFF.replace("250, // 2.5%", "300, // 3.0%"), DOC), {
    source: "differs",
    claims: "differs",
  });
  // An unrelated trailing sentence: the source differs, the claims match.
  assert.deepEqual(await verify(DIFF, DOC.replace("all pricing changes", "all pricing moves")), {
    source: "differs",
    claims: "matches",
  });
  // Unrelated text inserted before a claim shifts its locator: claims still match.
  assert.deepEqual(await verify(DIFF, `Forward-looking statements follow.\n${DOC}`), {
    source: "differs",
    claims: "matches",
  });
  // A different document name is a different source and a different claim source.
  const renamed = await verifyPlumbSources(plumb, {
    diff: DIFF,
    documents: [{ name: "other.txt", text: DOC }],
  });
  assert.deepEqual(renamed, { source: "differs", claims: "differs" });

  // Moving claim ids, locators, and source versions leaves the verdict untouched.
  const before = workbenchRun(DIFF, DOC, iso(2)).result;
  const after = workbenchRun(DIFF, `Forward-looking statements follow.\n${DOC}`, iso(3)).result;
  assert.equal(after.verdict, before.verdict);
  assert.deepEqual(
    after.findings.map((finding) => [finding.subject, finding.status]),
    before.findings.map((finding) => [finding.subject, finding.status]),
  );

  // Plumb v1 (legacy) is unavailable, never "does not match".
  const legacyPlumb = { ...plumb, digestVersion: "plumb.claims.v1" as const };
  delete (legacyPlumb as Partial<PersistedReceipt>).sourceDigest;
  const v1 = verificationMode(legacyPlumb);
  assert.equal(v1.kind, "unavailable");
  assert.ok(v1.kind === "unavailable" && /load/i.test(v1.reason));

  // A receipt without digestVersion is read as its module's v1.
  const { digestVersion: _plumbVersion, ...noVersionPlumb } = legacyPlumb;
  assert.equal(receiptDigestVersion(noVersionPlumb), "plumb.claims.v1");
  assert.equal(verificationMode(noVersionPlumb).kind, "unavailable");
  const { digestVersion: _veilVersion, ...noVersionVeil } = veil;
  assert.equal(receiptDigestVersion(noVersionVeil), "veil.raw-text.v1");
  assert.equal(await verifyVeilText(noVersionVeil, raw), "matches");
  assert.equal(persistedReceiptSchema.safeParse(noVersionVeil).success, true);

  // Malformed JSON and schema failures are rejected before any verification.
  assert.throws(() => JSON.parse("{ not json"));
  assert.equal(persistedReceiptSchema.safeParse({ id: "x" }).success, false);
}

// ---------------------------------------------------------------------------
// R-g2. The verifier is isolated: canary text reaches no storage and no store.
// ---------------------------------------------------------------------------
{
  const CANARY = "CANARY-VERIFIER-4417";
  const localStorage = new FakeLocalStorage();
  localStorage.setItem("juriscore.activePolicyIds", '["pii-baseline"]');
  const idb = new FakeIndexedDB();
  const store = createReceiptStore({ indexedDB: asFactory(idb), broadcast: false });
  const plumb = await plumbReceipt(DIFF, DOC, iso(4));
  await store.addReceipt(plumb);

  const globals = globalThis as unknown as Record<string, unknown>;
  const saved = { localStorage: globals.localStorage, indexedDB: globals.indexedDB };
  globals.localStorage = localStorage;
  globals.indexedDB = idb;
  try {
    const result = await verifyPlumbSources(toPersistedReceipt(plumb), {
      diff: `${DIFF}\n+// ${CANARY}`,
      documents: [{ name: DOC_NAME, text: `${DOC}\n${CANARY} kyc note.` }],
    });
    assert.equal(result.source, "differs");
    await new Promise((resolve) => setTimeout(resolve, 5));
  } finally {
    globals.localStorage = saved.localStorage;
    globals.indexedDB = saved.indexedDB;
  }
  for (const value of localStorage.entries.values()) assert.equal(value.includes(CANARY), false);
  for (const key of localStorage.entries.keys()) assert.equal(key.includes(CANARY), false);
  assert.equal(idb.dump().includes(CANARY), false);

  // The verifier modules import no store, no storage, and no demo-store writer.
  for (const path of [
    "src/components/receipt-verifier.tsx",
    "src/lib/juriscore/core/receipt-verify.ts",
  ]) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    for (const forbidden of [
      "demo-store",
      "receipt-store",
      "receipt-folder",
      "localStorage",
      "indexedDB",
      "setConnectedRepository",
      "addSourceDocument",
    ]) {
      assert.equal(source.includes(forbidden), false, `${path} references ${forbidden}`);
    }
  }
}

// ---------------------------------------------------------------------------
// R-f. IndexedDB and localStorage both failing: checks still complete, in memory.
// ---------------------------------------------------------------------------
{
  for (const mode of ["throw-on-open", "error-on-open", "throw-on-use"] as const) {
    const store = createReceiptStore({
      indexedDB: asFactory(failingIndexedDB(mode)),
      broadcast: false,
    });
    const veil = await veilReceipt("Contact maya.patel@example.test", iso(10));
    const plumb = await plumbReceipt(DIFF, DOC, iso(11));
    await store.addReceipt(veil);
    await store.addReceipt(plumb);
    assert.deepEqual(store.status(), { persistent: false, note: HISTORY_NOT_SAVED_NOTE }, mode);
    const listed = await store.listReceipts();
    assert.deepEqual(
      listed.items.map((item) => item.id),
      [plumb.id, veil.id],
      mode,
    );
    // Downloadable: the in-memory record serializes exactly as a stored one would.
    assert.equal(serializeReceipt(listed.items[1]), serializeReceipt(veil));
    await store.setSetting("receiptFolder", { name: "memory" });
    assert.deepEqual(await store.getSetting("receiptFolder"), { name: "memory" });
    await store.clearReceipts();
    assert.equal(await store.countReceipts(), 0);
  }

  // Every localStorage path goes through safeStorage, which never throws.
  let failures = 0;
  const throwing = createSafeStorage(
    () => new ThrowingLocalStorage() as unknown as Storage,
    () => (failures += 1),
  );
  assert.equal(throwing.get("juriscore.customPolicies"), null);
  throwing.set("juriscore.customPolicies", "[]");
  throwing.remove("juriscore.plumbRepository.v1");
  assert.equal(failures, 3);
  const unreachable = createSafeStorage(
    () => {
      throw new Error("SecurityError");
    },
    () => (failures += 1),
  );
  assert.equal(unreachable.get("x"), null);
  assert.equal(failures, 4);
  // One backing store, resolved on every call, as window.localStorage is.
  const backing = new FakeLocalStorage();
  const working = createSafeStorage(
    () => backing as unknown as Storage,
    () => (failures += 1),
  );
  working.set("a", "1");
  assert.equal(working.get("a"), "1");
  assert.equal(failures, 4);

  // demo-store routes every localStorage access through safeStorage.
  const demoStore = readFileSync(
    new URL("../src/lib/juriscore/demo-store.tsx", import.meta.url),
    "utf8",
  );
  const directAccess = demoStore.match(/localStorage\s*\.\s*(getItem|setItem|removeItem)/g);
  assert.equal(directAccess, null, "demo-store touches localStorage directly");
  assert.ok(demoStore.includes("HISTORY_NOT_SAVED_NOTE"));
}

// ---------------------------------------------------------------------------
// R-g. No history, report, or folder path persists document text or detected values.
// ---------------------------------------------------------------------------
{
  const CANARY_EMAIL = "canary.person.3391@example.test";
  const CANARY_DOC = "CANARY-DOCUMENT-TEXT-6612";
  const idb = new FakeIndexedDB();
  const store = createReceiptStore({ indexedDB: asFactory(idb), broadcast: false });

  const raw = `Escalation from ${CANARY_EMAIL} about ${CANARY_DOC}.`;
  const veilRun = protectText(raw, { profile: "all_sensitive", strategy: "redact" });
  const veil = await createReceipt({
    ...veilReceiptInput(veilRun, raw, POLICIES),
    createdAt: iso(20),
  });
  await store.addReceipt(veil);

  const doc = `${DOC}\n${CANARY_DOC} remains confidential.`;
  const plumb = await plumbReceipt(DIFF, doc, iso(21));
  await store.addReceipt(plumb);
  await store.setSetting("receiptFolder", { name: "folder" });

  const persisted = idb.dump();
  for (const canary of [CANARY_EMAIL, CANARY_DOC]) {
    assert.equal(persisted.includes(canary), false, `IndexedDB holds ${canary}`);
  }
  // Plumb evidence and claim statements stay out of storage too.
  assert.equal(persisted.includes("remain capped"), false);
  assert.equal(persisted.includes("crossBorderFeeBps"), false);

  // Reports are user-initiated downloads: the Veil report carries sanitized text and
  // finding labels, never the detected value.
  const report = veilReportText(veilRun, "redact", toPersistedReceipt(veil));
  assert.equal(report.includes(CANARY_EMAIL), false);
  assert.ok(report.includes("Findings"));
  const plumbReport = plumbReportMarkdown(
    workbenchRun(DIFF, doc, iso(21)).result,
    toPersistedReceipt(plumb),
  );
  assert.ok(plumbReport.includes("Claims compared"));
  assert.ok(plumbReport.includes(plumb.id));
}

// ---------------------------------------------------------------------------
// Live updates: every add and clear notifies listeners (the Receipts tab and Overview
// refresh on these; other tabs get the same events over BroadcastChannel).
// ---------------------------------------------------------------------------
{
  const store = createReceiptStore({ indexedDB: asFactory(new FakeIndexedDB()), broadcast: false });
  const events: string[] = [];
  const unsubscribe = store.onChange((event) =>
    events.push(event.type === "added" ? `added:${event.id}` : event.type),
  );
  const receipt = await veilReceipt("live update", iso(30));
  await store.addReceipt(receipt);
  // The listener fires after the write committed, so a refresh sees the new receipt.
  assert.deepEqual(events, [`added:${receipt.id}`]);
  assert.equal((await store.listReceipts({ offset: 0, limit: 5 })).items[0].id, receipt.id);
  await store.clearReceipts();
  assert.deepEqual(events, [`added:${receipt.id}`, "cleared"]);
  unsubscribe();
  await store.addReceipt(receipt);
  assert.equal(events.length, 2);
}

// ---------------------------------------------------------------------------
// Domain column: derived from policyVersion against the catalog, never hard-coded.
// ---------------------------------------------------------------------------
{
  const builtInDomains = Object.fromEntries(
    BUILT_IN_POLICIES.map((policy) => [policy.id, policyDomain(policy)]),
  );
  assert.deepEqual(builtInDomains, {
    "pii-baseline": "Privacy",
    "hipaa-privacy": "Healthcare",
    "soc2-tsc": "Security & compliance",
    "mitre-atlas": "AI security",
    "nist-ai-rmf": "AI governance",
    "nist-csf-2": "Cybersecurity",
  });

  const custom: PolicyDefinition = {
    ...BUILT_IN_POLICIES[0],
    id: "custom-acme@v1;draft",
    name: "Acme contract terms",
    shortName: "Acme",
    version: "v1",
    authority: "Acme Legal",
    custom: true,
    domain: undefined,
  };
  const encoded = encodePolicyVersion([
    { id: "soc2-tsc", version: "2017 TSC with March 2020 updates" },
    { id: "pii-baseline", version: "JurisCore 2026.07" },
    { id: "nist-ai-rmf", version: "AI RMF 1.0 + NIST AI 600-1" },
    { id: custom.id, version: custom.version },
  ]);
  assert.deepEqual(
    decodePolicyVersion(encoded).map((ref) => ref.id),
    ["custom-acme-v1-draft", "nist-ai-rmf", "pii-baseline", "soc2-tsc"],
  );
  assert.deepEqual(receiptDomains(encoded, [custom]), [
    "Custom · Acme Legal",
    "AI governance",
    "Privacy",
    "Security & compliance",
  ]);
  // A deleted custom policy no longer resolves; the receipt still renders.
  assert.deepEqual(receiptDomains(encoded, []), [
    "Custom (removed)",
    "AI governance",
    "Privacy",
    "Security & compliance",
  ]);
  // An edited custom policy shows its current authority.
  const edited = receiptDomains(encoded, [{ ...custom, authority: "Acme Risk" }]);
  assert.equal(edited[0], "Custom · Acme Risk");
  assert.deepEqual(receiptDomains("none"), ["None"]);
  // Two policies in one domain appear once.
  assert.deepEqual(
    receiptDomains(
      encodePolicyVersion([
        { id: "pii-baseline", version: "a" },
        { id: "pii-baseline", version: "b" },
      ]),
    ),
    ["Privacy"],
  );

  // Filtering by domain, and the options come from what is stored.
  const store = createReceiptStore({ indexedDB: asFactory(new FakeIndexedDB()), broadcast: false });
  const hipaaRun = protectText("Patient MRN 12345", { profile: "healthcare" });
  const hipaa = await createReceipt({
    ...veilReceiptInput(hipaaRun, "Patient MRN 12345", [
      { id: "hipaa-privacy", version: "45 CFR Parts 160 and 164" },
    ]),
    createdAt: iso(40),
  });
  const privacy = await veilReceipt("privacy only", iso(41));
  const none = await createReceipt({
    ...veilReceiptInput(protectText("x"), "x", []),
    createdAt: iso(42),
  });
  for (const receipt of [hipaa, privacy, none]) await store.addReceipt(receipt);
  const domainOf = receiptDomainResolver([]);
  const all = await store.exportReceipts();
  assert.deepEqual([...new Set(all.flatMap(domainOf))].sort(), ["Healthcare", "None", "Privacy"]);
  const healthcare = await store.listReceipts({ domain: "Healthcare", domainOf });
  assert.deepEqual(
    healthcare.items.map((item) => item.id),
    [hipaa.id],
  );
  assert.equal(await store.countReceipts({ domain: "all", domainOf }), 3);
  const csv = receiptsToCsv(all, domainOf);
  assert.ok(csv.split("\n")[0].includes("policyVersion,domain,"));
  assert.ok(csv.includes(",Healthcare,"));
}

// Receipts from before this slice (no digestVersion, no sourceDigest) still validate.
validationReceiptSchema.parse({
  id: "receipt.plumb.2026-08-01T00:00:00.000Z.abcdef12",
  module: "plumb",
  policyVersion: "none",
  inputDigest: "f".repeat(64),
  verdict: "allow",
  findingIds: [],
  evidence: [],
  maturity: "synthetic",
  createdAt: "2026-08-01T00:00:00.000Z",
});

console.log("JurisCore receipt store checks passed.");
