// Builds a tiny uncompressed PDF where one line is drawn as several show-text ops,
// which is exactly how real PDFs lay out text (kerning, font runs, table cells).
const content = `BT /F1 12 Tf 72 720 Td (SSN: 123-45-) Tj (6789) Tj ET
BT /F1 12 Tf 72 700 Td (Email: maya.patel@) Tj (example.test) Tj ET
BT /F1 12 Tf 72 680 Td (Phone: \(415\) 555-) Tj (0142) Tj ET
BT /F1 12 Tf 72 660 Td (MRN: 887) Tj (42199) Tj ET
`;
const objs = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
  `<< /Length ${content.length} >>\nstream\n${content}endstream`,
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
];
let pdf = "%PDF-1.4\n";
const offsets: number[] = [];
objs.forEach((body, i) => {
  offsets.push(pdf.length);
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
});
const xref = pdf.length;
pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
await Bun.write("tmp-split.pdf", pdf);
console.log("wrote tmp-split.pdf", pdf.length, "bytes");
