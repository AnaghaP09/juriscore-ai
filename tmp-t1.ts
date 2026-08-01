import { protectText } from "./src/lib/juriscore/veil/engine";
// Simulates how pdf.js item joining inserts a space between every text item.
const cases = [
  "SSN: 123-45- 6789",
  "Email: maya.patel@ example.test",
  "Phone: (415) 555- 0142",
  "Patient Name: Maya Patel",
  "Patient Name: Maya  Patel",
  "MRN: 887 42199",
];
for (const c of cases) {
  const r = protectText(c, { profile: "all_sensitive", strategy: "redact" });
  console.log(JSON.stringify(c), "->", r.findings.map(f=>f.category).join(",") || "(none)", "|", JSON.stringify(r.sanitizedText));
}
