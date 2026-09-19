export const ACCEPTED_DOCUMENT_TYPES = ".pdf,.docx,.pptx,.md,.txt,.png";
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
/** Human-readable list for UI copy, so the formats are named in exactly one place. */
export const ACCEPTED_DOCUMENT_LABEL = "PDF, DOCX, PPTX, Markdown, TXT, or PNG";

export type SupportedDocumentKind = "pdf" | "docx" | "pptx" | "text" | "png";

export type ExtractionProgress = {
  label: string;
  percent: number;
};

export type ExtractedDocument = {
  kind: SupportedDocumentKind;
  text: string;
  pageCount?: number;
  warnings: string[];
};

type ProgressReporter = (progress: ExtractionProgress) => void;

const extensionFor = (file: File) => file.name.split(".").pop()?.toLowerCase() ?? "";

export function documentKindFor(file: File): SupportedDocumentKind | null {
  const extension = extensionFor(file);

  if (file.type === "application/pdf" || extension === "pdf") return "pdf";
  if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === "docx"
  ) {
    return "docx";
  }
  if (
    file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    extension === "pptx"
  ) {
    return "pptx";
  }
  if (extension === "md" || extension === "markdown" || extension === "txt") return "text";
  if (file.type === "image/png" || extension === "png") return "png";
  // A plain-text file dragged in without a recognised extension is still readable text.
  if (file.type.startsWith("text/")) return "text";

  return null;
}

export function validateDocument(file: File): SupportedDocumentKind {
  const kind = documentKindFor(file);

  if (!kind) {
    throw new Error(`Unsupported file. Upload a ${ACCEPTED_DOCUMENT_LABEL} document.`);
  }

  if (file.size === 0) {
    throw new Error("This file is empty.");
  }

  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error("This file is larger than the 25 MB prototype limit.");
  }

  return kind;
}

function textItemValue(item: unknown) {
  if (!item || typeof item !== "object" || !("str" in item)) return "";

  const textItem = item as { hasEOL?: boolean; str: string };
  return `${textItem.str}${textItem.hasEOL ? "\n" : " "}`;
}

async function extractPdf(file: File, report: ProgressReporter): Promise<ExtractedDocument> {
  report({ label: "Loading PDF parser", percent: 5 });
  const [pdfjs, workerModule] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data: bytes, useSystemFonts: true });
  const document = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      report({
        label: `Reading PDF page ${pageNumber} of ${document.numPages}`,
        percent: Math.round(10 + (pageNumber / document.numPages) * 85),
      });
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map(textItemValue)
        .join("")
        .replace(/[ \t]+\n/g, "\n")
        .trim();
      pages.push(`--- Page ${pageNumber} ---\n${pageText}`);
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  const text = pages.join("\n\n").trim();
  if (!text.replace(/--- Page \d+ ---/g, "").trim()) {
    throw new Error(
      "No selectable text was found. This appears to be a scanned PDF; upload its pages as PNG files for OCR.",
    );
  }

  return { kind: "pdf", text, pageCount: pages.length, warnings: [] };
}

// Boundaries that separate one visual line or block from the next.
const BLOCK_BOUNDARY = /<\/(?:p|div|h[1-6]|li|tr)>|<br\s*\/?>/gi;
// Table cells become a column gap so a labelled field keeps its label/value shape.
const CELL_BOUNDARY = /<\/(?:td|th)>/gi;

const HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

function htmlToPlainText(html: string) {
  return html
    .replace(CELL_BOUNDARY, "\t")
    .replace(BLOCK_BOUNDARY, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(
      /&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/gi,
      (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity,
    )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractDocx(file: File, report: ProgressReporter): Promise<ExtractedDocument> {
  report({ label: "Reading Word document", percent: 15 });
  const mammoth = await import("mammoth");
  // extractRawText runs table cells and line breaks together with no separator
  // ("Tax ID: 94-0002718billing@example.invalid"), which hides every labelled field from
  // the detectors and lets the email pattern swallow the value sitting in front of it.
  // Convert to HTML instead, so row, cell, and <br> boundaries survive as real whitespace.
  const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const text = htmlToPlainText(result.value);

  if (!text) {
    throw new Error("No readable text was found in this DOCX file.");
  }

  report({ label: "Word document extracted", percent: 100 });
  return {
    kind: "docx",
    text,
    warnings: result.messages.map((message: { message: string }) => message.message),
  };
}

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXmlText(value: string) {
  return value
    .replace(/&amp;|&lt;|&gt;|&quot;|&apos;/g, (entity) => XML_ENTITIES[entity] ?? entity)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

/**
 * A slide is a list of paragraphs, each built from text runs. Keeping the paragraph
 * boundary as a newline matters: a run-together slide would hide labelled fields from
 * the Veil detectors and merge separate claims for Plumb.
 */
function slideText(xml: string) {
  return xml
    .split(/<\/a:p>/)
    .map((paragraph) =>
      [...paragraph.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)]
        .map((match) => decodeXmlText(match[1]))
        .join("")
        .trim(),
    )
    .filter((paragraph) => paragraph.length > 0)
    .join("\n");
}

async function extractPptx(file: File, report: ProgressReporter): Promise<ExtractedDocument> {
  report({ label: "Reading presentation", percent: 10 });
  const { default: JSZip } = await import("jszip");
  const archive = await JSZip.loadAsync(await file.arrayBuffer());

  const slideNames = Object.keys(archive.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort(
      (a, b) =>
        Number(/slide(\d+)\.xml$/.exec(a)?.[1] ?? 0) - Number(/slide(\d+)\.xml$/.exec(b)?.[1] ?? 0),
    );

  const slides: string[] = [];
  for (const [index, name] of slideNames.entries()) {
    report({
      label: `Reading slide ${index + 1} of ${slideNames.length}`,
      percent: Math.round(10 + ((index + 1) / slideNames.length) * 85),
    });
    const text = slideText(await archive.files[name].async("string"));
    slides.push(`--- Slide ${index + 1} ---\n${text}`);
  }

  const text = slides.join("\n\n").trim();
  if (!text.replace(/--- Slide \d+ ---/g, "").trim()) {
    throw new Error(
      "No readable text was found in this presentation. Its slides may be images; upload them as PNG files for OCR.",
    );
  }

  return { kind: "pptx", text, pageCount: slides.length, warnings: [] };
}

async function extractPlainText(file: File, report: ProgressReporter): Promise<ExtractedDocument> {
  report({ label: "Reading text file", percent: 20 });
  const text = (await file.text()).trim();

  if (!text) {
    throw new Error("This file contains no readable text.");
  }

  report({ label: "Text file read", percent: 100 });
  return { kind: "text", text, warnings: [] };
}

async function extractPng(file: File, report: ProgressReporter): Promise<ExtractedDocument> {
  report({ label: "Starting on-device OCR", percent: 5 });
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", undefined, {
    logger: (message) => {
      const progress = typeof message.progress === "number" ? message.progress : 0;
      report({
        label: message.status ? `OCR: ${message.status}` : "Running OCR",
        percent: Math.max(5, Math.round(progress * 100)),
      });
    },
  });

  try {
    const result = await worker.recognize(file);
    const text = result.data.text.trim();

    if (!text) {
      throw new Error("OCR could not detect readable text in this PNG image.");
    }

    return { kind: "png", text, pageCount: 1, warnings: [] };
  } finally {
    await worker.terminate();
  }
}

export async function extractDocumentText(
  file: File,
  report: ProgressReporter,
): Promise<ExtractedDocument> {
  const kind = validateDocument(file);

  if (kind === "pdf") return extractPdf(file, report);
  if (kind === "docx") return extractDocx(file, report);
  if (kind === "pptx") return extractPptx(file, report);
  if (kind === "text") return extractPlainText(file, report);
  return extractPng(file, report);
}
