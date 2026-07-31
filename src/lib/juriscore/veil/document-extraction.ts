export const ACCEPTED_DOCUMENT_TYPES = ".pdf,.docx,.png";
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export type SupportedDocumentKind = "pdf" | "docx" | "png";

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
  if (file.type === "image/png" || extension === "png") return "png";

  return null;
}

export function validateDocument(file: File): SupportedDocumentKind {
  const kind = documentKindFor(file);

  if (!kind) {
    throw new Error("Unsupported file. Upload a PDF, DOCX, or PNG document.");
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

async function extractDocx(file: File, report: ProgressReporter): Promise<ExtractedDocument> {
  report({ label: "Reading Word document", percent: 15 });
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const text = result.value.trim();

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
  return extractPng(file, report);
}
