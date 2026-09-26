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
  sha256Hex,
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
  RECEIPTS_NOT_SAVED_NOTE,
  RECEIPT_HISTORY_LIMIT,
  SETTINGS_NOT_SAVED_NOTE,
  clampPageOffset,
  createReceiptStore,
  receiptsToCsv,
  receiptsToJson,
  storageNote,
  type ReceiptStoreEvent,
} from "../src/lib/juriscore/core/receipt-store";
import { createGeneration } from "../src/lib/juriscore/core/generation";
import {
  writeReceiptToFolder,
  type ReceiptFolderHandle,
} from "../src/lib/juriscore/core/receipt-folder";
import {
  verificationMode,
  verifyPlumbSources,
  verifyVeilText,
} from "../src/lib/juriscore/core/receipt-verify";
import {
  RUN_FINALIZER_CAPACITY,
  createReceiptRunFinalizer,
  createRunFinalizer,
  sharedReceiptRunFinalizer,
  type RunFinalizer,
} from "../src/lib/juriscore/core/run-finalizer";
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
    assert.deepEqual(store.status(), { persistent: false, note: RECEIPTS_NOT_SAVED_NOTE }, mode);
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
    // Only temporary history is cleared; a database that opened before failing may still
    // hold receipts this tab can no longer reach, and the result says so.
    assert.deepEqual(
      await store.clearReceipts(),
      { status: "memory-cleared", persistedRemain: mode === "throw-on-use" },
      mode,
    );
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
  // The one notice is composed from what actually failed (R-006 below).
  assert.ok(demoStore.includes("storageNote({"));
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
  assert.deepEqual(await store.clearReceipts(), { status: "deleted" });
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

// ---------------------------------------------------------------------------
// R-001. The finalizer reuses a run's receipt by its full identity, not just the last key.
// ---------------------------------------------------------------------------
{
  const store = createReceiptStore({ indexedDB: asFactory(new FakeIndexedDB()), broadcast: false });
  const finalize = createRunFinalizer<PersistedReceipt>();
  let builds = 0;
  // The workbench's key: strategy, policy version, and the input digest (never the text).
  const runKey = async (strategy: "redact" | "tokenize", raw: string) =>
    JSON.stringify([strategy, encodePolicyVersion(POLICIES), await sha256Hex(raw)]);
  const finalizeRun = async (strategy: "redact" | "tokenize", raw: string) =>
    finalize(await runKey(strategy, raw), async () => {
      builds += 1;
      const run = protectText(raw, { profile: "all_sensitive", strategy });
      const created = await createReceipt({
        ...veilReceiptInput(run, raw, POLICIES),
        createdAt: iso(3000 + builds),
      });
      return (await store.addReceipt(created)).receipt;
    });

  const inputA = "Contact maya.patel@example.test about acme-prod-4831.";
  const inputB = "Call 415-555-0199 about the export timeout.";
  assert.equal((await runKey("redact", inputA)).includes("maya.patel"), false);

  // Copy A, copy B, restore A and download: A is reused, not built and stored again.
  const copiedA = await finalizeRun("redact", inputA);
  await finalizeRun("redact", inputB);
  const downloadedA = await finalizeRun("redact", inputA);
  assert.equal(builds, 2);
  assert.equal(downloadedA, copiedA);

  // Redact → Tokenize → Redact: one receipt per strategy, the first reused on return.
  const tokenized = await finalizeRun("tokenize", inputA);
  const redactedAgain = await finalizeRun("redact", inputA);
  assert.equal(builds, 3);
  assert.notEqual(tokenized?.id, copiedA?.id);
  assert.equal(redactedAgain, copiedA);
  assert.equal(await store.countReceipts({ module: "veil" }), 3);

  // A failed entry is dropped for retry even after other runs were finalized.
  const retry = createRunFinalizer<string>();
  assert.equal(await retry("a", async () => null), null);
  assert.equal(await retry("b", async () => "b"), "b");
  assert.equal(
    await retry("a", async () => {
      throw new Error("boom");
    }),
    null,
  );
  assert.equal(await retry("a", async () => "a"), "a");
  assert.equal(await retry("b", async () => "rebuilt"), "b");

  // Bounded: beyond capacity the run built longest ago is forgotten. Reuse does not refresh
  // it, so the kept runs are the ones whose receipts were created last (as in the history).
  const bounded = createRunFinalizer<string>(2);
  await bounded("x", async () => "x1");
  await bounded("y", async () => "y1");
  assert.equal(await bounded("x", async () => "x2"), "x1"); // reused, not refreshed
  await bounded("z", async () => "z1"); // evicts x, built first
  assert.equal(await bounded("y", async () => "y2"), "y1");
  assert.equal(await bounded("x", async () => "x3"), "x3");
}

// ---------------------------------------------------------------------------
// R-008. Run identities outlive the page component and follow the history.
// ---------------------------------------------------------------------------
{
  type Recorded = { receipt: PersistedReceipt };
  const store = createReceiptStore({ indexedDB: asFactory(new FakeIndexedDB()), broadcast: false });
  let builds = 0;
  const keyFor = async (raw: string) =>
    JSON.stringify(["redact", encodePolicyVersion(POLICIES), await sha256Hex(raw)]);
  const buildFor = (raw: string) => async (): Promise<Recorded> => {
    builds += 1;
    const created = await veilReceipt(raw, iso(4000 + builds));
    return { receipt: (await store.addReceipt(created)).receipt };
  };
  const finalizeWith = async (finalize: RunFinalizer<Recorded>, raw: string) =>
    finalize(await keyFor(raw), buildFor(raw));

  // Navigation: copy the sample, leave Veil (unmount), return (a new mount), download.
  // Both mounts get the one tab-wide finalizer, so the unchanged sample is not stored again.
  const firstMount = sharedReceiptRunFinalizer<Recorded>("check-navigation", store);
  const copied = await finalizeWith(firstMount, "Default sample, copied before leaving.");
  const secondMount = sharedReceiptRunFinalizer<Recorded>("check-navigation", store);
  assert.equal(secondMount, firstMount);
  const downloaded = await finalizeWith(secondMount, "Default sample, copied before leaving.");
  assert.equal(builds, 1);
  assert.equal(downloaded?.receipt.id, copied?.receipt.id);
  assert.equal(await store.countReceipts(), 1);

  // The route no longer owns a finalizer; it uses the tab-wide one.
  const route = readFileSync(
    new URL("../src/routes/dashboard.redaction.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(route.includes('sharedReceiptRunFinalizer<RecordedReceipt>("veil")'));
  assert.equal(route.includes("createRunFinalizer"), false);

  // Reuse beyond 64 identities: every receipt still in the history is reused.
  assert.equal(RUN_FINALIZER_CAPACITY, RECEIPT_HISTORY_LIMIT);
  const wide = createReceiptRunFinalizer<Recorded>(store);
  builds = 0;
  const firstWide = await finalizeWith(wide, "identity 0");
  for (let index = 1; index < 70; index += 1) await finalizeWith(wide, `identity ${index}`);
  assert.equal(builds, 70);
  assert.equal(await finalizeWith(wide, "identity 0"), firstWide);
  await finalizeWith(wide, "identity 5");
  assert.equal(builds, 70);
  assert.equal(await store.countReceipts({ module: "veil" }), 71);

  // Explicit clearing forgets every identity: the next action records a receipt again.
  assert.deepEqual(await store.clearReceipts(), { status: "deleted" });
  const afterClear = await finalizeWith(wide, "identity 0");
  assert.equal(builds, 71);
  assert.notEqual(afterClear?.receipt.id, firstWide?.receipt.id);
  assert.equal(await store.countReceipts(), 1);

  // Retention: a run whose receipt was trimmed is recorded again; one still kept is reused.
  const small = createReceiptStore({
    indexedDB: asFactory(new FakeIndexedDB()),
    broadcast: false,
    limit: 3,
  });
  // The default capacity, so "a" is still remembered and only its trimmed receipt is stale.
  const smallFinalize = createReceiptRunFinalizer<Recorded>(small);
  let smallBuilds = 0;
  const smallRun = async (raw: string) =>
    smallFinalize(await keyFor(raw), async () => {
      smallBuilds += 1;
      const created = await veilReceipt(raw, iso(4500 + smallBuilds));
      return { receipt: (await small.addReceipt(created)).receipt };
    });
  const trimmedRun = await smallRun("a");
  await smallRun("b");
  await smallRun("c");
  await smallRun("d"); // trims a
  assert.equal(await small.hasReceipt(trimmedRun?.receipt.id ?? ""), false);
  const kept = await smallRun("c");
  assert.equal(smallBuilds, 4, "a receipt still in the history is reused");
  assert.ok(kept && (await small.hasReceipt(kept.receipt.id)));
  const rerecorded = await smallRun("a");
  assert.equal(smallBuilds, 5, "a trimmed receipt is recorded again");
  assert.ok(rerecorded && (await small.hasReceipt(rerecorded.receipt.id)));
  assert.equal(await small.countReceipts(), 3);
}

// ---------------------------------------------------------------------------
// R-009. A digest failure before finalization shows the receipt error; Save report still
// downloads the sanitized report without a receipt.
// ---------------------------------------------------------------------------
{
  const route = readFileSync(
    new URL("../src/routes/dashboard.redaction.tsx", import.meta.url),
    "utf8",
  );
  const start = route.indexOf("const finalizeRun = async");
  const end = route.indexOf("const copySanitized");
  assert.ok(start > 0 && end > start);
  const finalizeBody = route.slice(start, end);
  const tryAt = finalizeBody.indexOf("try {");
  assert.ok(tryAt > 0, "finalization runs inside a try");
  assert.ok(finalizeBody.indexOf("await sha256Hex(") > tryAt, "the input digest is guarded");
  assert.ok(finalizeBody.includes("setReceiptError(reason);"));
  assert.ok(finalizeBody.includes("return null;"));
  assert.ok(finalizeBody.includes("Promise<RecordedReceipt | null>"));
  // Save report downloads whether or not a receipt was produced.
  const saveBody = route.slice(
    route.indexOf("const saveReport"),
    route.indexOf("const generateReceipt"),
  );
  assert.ok(saveBody.includes("recorded?.receipt ?? null"));
}

// ---------------------------------------------------------------------------
// R-010. Same-millisecond runs get distinct ids, history entries, and folder files.
// ---------------------------------------------------------------------------
{
  const instant = iso(5000);
  const store = createReceiptStore({ indexedDB: asFactory(new FakeIndexedDB()), broadcast: false });
  // Two different Veil runs, and two identical Plumb checks, in the same millisecond.
  const veilA = await veilReceipt("same instant A", instant);
  const veilB = await veilReceipt("same instant B", instant);
  const plumbA = await plumbReceipt(DIFF, DOC, instant);
  const plumbB = await plumbReceipt(DIFF, DOC, instant);
  assert.equal(plumbA.inputDigest, plumbB.inputDigest);
  const ids = [veilA.id, veilB.id, plumbA.id, plumbB.id];
  assert.equal(new Set(ids).size, 4);
  for (const receipt of [veilA, veilB, plumbA, plumbB]) await store.addReceipt(receipt);
  assert.equal(await store.countReceipts(), 4);
  assert.equal(await store.countReceipts({ module: "plumb" }), 2);

  // The folder sink writes one file per receipt, never over another.
  const files = new Map<string, string>();
  const folder: ReceiptFolderHandle = {
    name: "receipts",
    queryPermission: async () => "granted",
    getDirectoryHandle: async (name) => ({
      ...folder,
      name,
      getFileHandle: async (fileName) => ({
        createWritable: async () => ({
          write: async (data: string) => {
            files.set(`${name}/${fileName}`, data);
          },
          close: async () => undefined,
        }),
      }),
    }),
    getFileHandle: async () => {
      throw new Error("receipts are written under a module folder");
    },
  };
  const paths: string[] = [];
  for (const receipt of [veilA, veilB, plumbA, plumbB]) {
    const written = await writeReceiptToFolder(receipt, {
      handle: folder,
      fallback: () => undefined,
    });
    if (!written.ok) throw new Error(`folder write failed: ${written.reason}`);
    paths.push(written.path);
  }
  assert.equal(new Set(paths).size, 4);
  assert.equal(files.size, 4);
  for (const receipt of [veilA, veilB, plumbA, plumbB]) {
    const match = [...files.values()].filter((body) => JSON.parse(body).id === receipt.id);
    assert.equal(match.length, 1);
  }

  // A legacy receipt (four-part id, no nonce) still stores, lists, and writes.
  const legacy = {
    ...toPersistedReceipt(veilA),
    id: `receipt.veil.${instant}.${veilA.inputDigest.slice(0, 8)}`,
  };
  await store.addReceipt(legacy);
  assert.equal(await store.hasReceipt(legacy.id), true);
  const legacyWrite = await writeReceiptToFolder(legacy, {
    handle: folder,
    fallback: () => undefined,
  });
  assert.ok(legacyWrite.ok && !paths.includes(legacyWrite.path));
}

// ---------------------------------------------------------------------------
// R-011. A stale file load never overwrites newer verifier inputs.
// ---------------------------------------------------------------------------
{
  // The pattern: a load takes a token; an edit, a newer load, a receipt change, or unmount
  // invalidates it; a stale completion changes nothing.
  const loads = createGeneration();
  let diff = "";
  const loadA = loads.begin();
  const loadB = loads.begin(); // a newer load replaces A
  if (loads.isCurrent(loadB)) diff = "B";
  if (loads.isCurrent(loadA)) diff = "A"; // A finishes last
  assert.equal(diff, "B");
  const loadC = loads.begin();
  loads.invalidate(); // the user edits the textarea
  diff = "typed";
  if (loads.isCurrent(loadC)) diff = "C";
  assert.equal(diff, "typed");

  const verifier = readFileSync(
    new URL("../src/components/receipt-verifier.tsx", import.meta.url),
    "utf8",
  );
  // Diff loads and document uploads each have their own tokens, apart from verification.
  assert.ok(verifier.includes("const diffLoads = useReceiptGeneration(receipt)"));
  assert.ok(verifier.includes("const documentLoads = useReceiptGeneration(receipt)"));
  assert.ok(verifier.includes("if (!diffLoads.isCurrent(token)) return;"));
  assert.ok(verifier.includes("if (!documentLoads.isCurrent(token)) return;"));
  // A diff edit invalidates a pending diff load; errors and the busy state commit only
  // for the current upload.
  assert.ok(verifier.includes("diffLoads.invalidate();"));
  assert.ok(verifier.includes("if (documentLoads.isCurrent(token)) setError("));
  assert.ok(verifier.includes("if (documentLoads.isCurrent(token)) setUploading(false)"));
  // The diff is committed only after the load's token check.
  const loadAt = verifier.indexOf("await file.text()");
  assert.ok(loadAt > 0);
  const afterLoad = verifier.slice(loadAt);
  assert.ok(
    afterLoad.indexOf("if (!diffLoads.isCurrent(token)) return;") <
      afterLoad.indexOf("setDiff(text)"),
  );
}

// ---------------------------------------------------------------------------
// R-002. Clearing reports the outcome; a failed durable deletion is not shown as cleared.
// ---------------------------------------------------------------------------
{
  const idb = new FakeIndexedDB();
  const store = createReceiptStore({ indexedDB: asFactory(idb), broadcast: false });
  const events: ReceiptStoreEvent["type"][] = [];
  store.onChange((event) => events.push(event.type));
  await store.addReceipt(await veilReceipt("clear one", iso(3100)));
  await store.addReceipt(await veilReceipt("clear two", iso(3101)));

  idb.setFault("clear");
  const failed = await store.clearReceipts();
  assert.equal(failed.status, "failed");
  assert.ok(failed.status === "failed" && failed.reason.length > 0);
  assert.equal(events.includes("cleared"), false, "a failed clear must not announce clearance");
  // Still persistent, still listed here, and still there after a reload.
  assert.equal(store.status().persistent, true);
  assert.equal(await store.countReceipts(), 2);
  const reloaded = createReceiptStore({ indexedDB: asFactory(idb), broadcast: false });
  assert.equal(await reloaded.countReceipts(), 2);

  // Retry succeeds; clearance is announced only after the deletion committed.
  idb.setFault(null);
  assert.deepEqual(await store.clearReceipts(), { status: "deleted" });
  assert.equal(events[events.length - 1], "cleared");
  const afterDelete = createReceiptStore({ indexedDB: asFactory(idb), broadcast: false });
  assert.equal(await afterDelete.countReceipts(), 0);

  // Memory-only history: clearing says it cleared temporary history, with nothing saved.
  const memoryOnly = createReceiptStore({ indexedDB: null, broadcast: false });
  await memoryOnly.addReceipt(await veilReceipt("temporary", iso(3102)));
  assert.deepEqual(await memoryOnly.clearReceipts(), {
    status: "memory-cleared",
    persistedRemain: false,
  });

  // Saved, then storage failed: clearing memory does not claim the saved receipt is gone.
  const idb2 = new FakeIndexedDB();
  const degrading = createReceiptStore({ indexedDB: asFactory(idb2), broadcast: false });
  const saved = await veilReceipt("saved before failure", iso(3103));
  await degrading.addReceipt(saved);
  idb2.setFault("all");
  await degrading.addReceipt(await veilReceipt("after failure", iso(3104)));
  assert.deepEqual(await degrading.clearReceipts(), {
    status: "memory-cleared",
    persistedRemain: true,
  });
  idb2.setFault(null);
  const later = createReceiptStore({ indexedDB: asFactory(idb2), broadcast: false });
  assert.deepEqual(
    (await later.listReceipts()).items.map((item) => item.id),
    [saved.id],
  );
}

// ---------------------------------------------------------------------------
// R-003. A later storage failure keeps the history already read or committed.
// ---------------------------------------------------------------------------
{
  const idb = new FakeIndexedDB();
  const writer = createReceiptStore({ indexedDB: asFactory(idb), broadcast: false });
  const earlier: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    const receipt = await veilReceipt(`earlier ${index}`, iso(3200 + index));
    earlier.push(receipt.id);
    await writer.addReceipt(receipt);
  }
  await writer.setSetting("receiptFolder", { name: "kept" });

  // A reader that listed history, then loses storage on its next write.
  const reader = createReceiptStore({ indexedDB: asFactory(idb), broadcast: false });
  assert.equal((await reader.listReceipts()).total, 3);
  assert.deepEqual(await reader.getSetting("receiptFolder"), { name: "kept" });
  idb.setFault("all");
  const failedWrite = await veilReceipt("written during failure", iso(3210));
  await reader.addReceipt(failedWrite);
  assert.equal(reader.status().persistent, false);
  const readerIds = (await reader.exportReceipts()).map((item) => item.id);
  assert.deepEqual(readerIds, [failedWrite.id, ...[...earlier].reverse()]);
  assert.deepEqual(await reader.getSetting("receiptFolder"), { name: "kept" });

  // The writer never listed; its snapshot comes from its own committed writes. A settings
  // failure degrades it without losing those receipts either.
  await writer.setSetting("another", 1);
  assert.equal(writer.status().persistent, false);
  assert.deepEqual(
    (await writer.exportReceipts()).map((item) => item.id),
    [...earlier].reverse(),
  );
  assert.deepEqual(await writer.getSetting("receiptFolder"), { name: "kept" });
  assert.equal(await writer.getSetting("another"), 1);

  // The snapshot is bounded by the history limit and holds validated records only.
  idb.setFault(null);
  const smallIdb = new FakeIndexedDB();
  const bounded = createReceiptStore({
    indexedDB: asFactory(smallIdb),
    broadcast: false,
    limit: 2,
  });
  for (let index = 0; index < 4; index += 1) {
    await bounded.addReceipt(await veilReceipt(`bounded ${index}`, iso(3300 + index)));
  }
  smallIdb.setFault("all");
  assert.equal(await bounded.countReceipts(), 2);
  assert.equal(bounded.status().persistent, false);
}

// ---------------------------------------------------------------------------
// R-004. An older verification never commits over newer inputs.
// ---------------------------------------------------------------------------
{
  const generation = createGeneration();
  const plumb = toPersistedReceipt(await plumbReceipt(DIFF, DOC, iso(3400)));
  let shown: { source: string; claims: string } | null = null;

  // Verify the matching sources, then edit before the hash finishes: nothing is shown.
  const token = generation.begin();
  const pending = verifyPlumbSources(plumb, {
    diff: DIFF,
    documents: [{ name: DOC_NAME, text: DOC }],
  });
  generation.invalidate(); // the user edits the diff or removes a document
  const stale = await pending;
  assert.deepEqual(stale, { source: "matches", claims: "matches" });
  if (generation.isCurrent(token)) shown = stale;
  assert.equal(shown, null);

  // A newer verification supersedes an older one still in flight.
  const first = generation.begin();
  const second = generation.begin();
  assert.equal(generation.isCurrent(first), false);
  assert.equal(generation.isCurrent(second), true);
  generation.invalidate(); // unmount or receipt change
  assert.equal(generation.isCurrent(second), false);

  // Both verifiers commit only through the generation check, and invalidate on edits.
  const verifier = readFileSync(
    new URL("../src/components/receipt-verifier.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(verifier.includes("if (generation.isCurrent(token)) setMatch(next)"));
  assert.ok(verifier.includes("if (generation.isCurrent(token)) setResult(next)"));
  assert.equal(/setMatch\(await /.test(verifier), false);
  assert.equal(/setResult\(\s*await /.test(verifier), false);
  assert.ok(verifier.includes("() => generation.invalidate()"), "unmount must invalidate");
}

// ---------------------------------------------------------------------------
// R-005. A page offset past a shrunken total moves back to a page with rows.
// ---------------------------------------------------------------------------
{
  assert.equal(clampPageOffset(50, 1, 50), 0);
  assert.equal(clampPageOffset(50, 0, 50), 0);
  assert.equal(clampPageOffset(0, 0, 50), 0);
  assert.equal(clampPageOffset(100, 120, 50), 100);
  assert.equal(clampPageOffset(150, 120, 50), 100);
  assert.equal(clampPageOffset(100, 100, 50), 50);
  assert.equal(clampPageOffset(-5, 10, 50), 0);

  // Page 2, history cleared elsewhere, one new receipt: the clamped page shows it.
  const store = createReceiptStore({ indexedDB: asFactory(new FakeIndexedDB()), broadcast: false });
  for (let index = 0; index < 60; index += 1) {
    await store.addReceipt(await veilReceipt(`paged ${index}`, iso(3500 + index)));
  }
  let offset = 50;
  assert.equal((await store.listReceipts({ offset, limit: 50 })).items.length, 10);
  await store.clearReceipts();
  const fresh = await veilReceipt("after clear", iso(3600));
  await store.addReceipt(fresh);
  const stalePage = await store.listReceipts({ offset, limit: 50 });
  assert.equal(stalePage.items.length, 0);
  offset = clampPageOffset(offset, stalePage.total, 50);
  const page = await store.listReceipts({ offset, limit: 50 });
  assert.deepEqual(
    page.items.map((item) => item.id),
    [fresh.id],
  );

  const audit = readFileSync(new URL("../src/routes/dashboard.audit.tsx", import.meta.url), "utf8");
  assert.ok(audit.includes("clampPageOffset(offset, nextPage.total, PAGE_SIZE)"));
  assert.ok(audit.includes('result.status === "failed"'), "clear failures are reported");
}

// ---------------------------------------------------------------------------
// R-006. The storage notice names what failed and never overstates receipt loss.
// ---------------------------------------------------------------------------
{
  assert.equal(storageNote({ receiptsFailed: false, settingsFailed: false }), null);
  const settingsOnly = storageNote({ receiptsFailed: false, settingsFailed: true });
  assert.equal(settingsOnly, SETTINGS_NOT_SAVED_NOTE);
  assert.ok(settingsOnly?.includes("Receipt history is still saved"));
  assert.equal(/receipts (and settings )?last only/i.test(settingsOnly ?? ""), false);
  assert.equal(
    storageNote({ receiptsFailed: false, settingsFailed: true, folderActive: true }),
    SETTINGS_NOT_SAVED_NOTE,
  );
  assert.equal(
    storageNote({ receiptsFailed: true, settingsFailed: false }),
    RECEIPTS_NOT_SAVED_NOTE,
  );
  assert.equal(storageNote({ receiptsFailed: true, settingsFailed: true }), HISTORY_NOT_SAVED_NOTE);
  const withFolder = storageNote({
    receiptsFailed: true,
    settingsFailed: true,
    folderActive: true,
  });
  assert.ok(withFolder?.startsWith(HISTORY_NOT_SAVED_NOTE));
  assert.ok(withFolder?.includes("folder"));

  const demoStore = readFileSync(
    new URL("../src/lib/juriscore/demo-store.tsx", import.meta.url),
    "utf8",
  );
  // A localStorage failure is tracked apart from receipt storage.
  assert.ok(demoStore.includes("() => setSettingsStorageFailed(true)"));
  assert.equal(demoStore.includes("HISTORY_NOT_SAVED_NOTE"), false);
}

// ---------------------------------------------------------------------------
// R-007. The Overview counter says what it counts: receipts recorded, not downloaded.
// ---------------------------------------------------------------------------
{
  const overview = readFileSync(
    new URL("../src/routes/dashboard.index.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(overview.includes("Receipts downloaded"), false);
  assert.ok(overview.includes("Receipts recorded"));
}

console.log("JurisCore receipt store checks passed.");
