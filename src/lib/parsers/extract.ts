import type { FileKind } from "../upload/validate";

const MAX_PDF_PAGES = 100;
const MAX_XLSX_ROWS = 1000;
const MAX_TEXT_CHARS = 400_000;

function cap(s: string): string {
  return s.length > MAX_TEXT_CHARS ? s.slice(0, MAX_TEXT_CHARS) : s;
}

async function docxText(buf: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const r = await mammoth.extractRawText({ buffer: buf });
  return r.value;
}

/** Spreadsheet layout: question | A | B | C | D | answer (header row optional). Converted to template text. */
async function xlsxText(buf: Buffer): Promise<string> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return "";
  const cell = (v: unknown) => (v == null ? "" : typeof v === "object" ? String((v as { text?: unknown; result?: unknown }).text ?? (v as { result?: unknown }).result ?? "") : String(v)).trim();
  const lines: string[] = [];
  let n = 0;
  ws.eachRow((row, idx) => {
    if (idx > MAX_XLSX_ROWS) return;
    const c = Array.isArray(row.values) ? row.values.slice(1).map(cell) : [];
    if (idx === 1 && /^(q|question|s\.?\s*no)/i.test(c[0] ?? "")) return; // header
    if (!c[0]) return;
    n++;
    lines.push(`${n}. ${c[0]}`);
    const opts = c.slice(1, 5).filter(Boolean);
    opts.forEach((o, i) => lines.push(`${String.fromCharCode(65 + i)}) ${o}`));
    const ans = (c[5] ?? "").trim();
    if (/^[A-Fa-f]$/.test(ans)) lines.push(`Answer: ${ans.toUpperCase()}`);
  });
  return lines.join("\n");
}

async function pdfText(buf: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise;
  const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
  const parts: string[] = [];
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Break lines on vertical position changes: hasEOL alone is unreliable across PDF producers.
    let line = "";
    let lastY: number | null = null;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = item.transform[5] as number;
      if (lastY !== null && Math.abs(y - lastY) > 2) line += "\n";
      else if (line && !line.endsWith("\n")) line += " ";
      line += item.str;
      if (item.hasEOL) line += "\n";
      lastY = y;
    }
    parts.push(line);
  }
  await doc.destroy();
  return parts.join("\n");
}

/** Returns plain text, or null for kinds that need vision (images). */
export async function extractText(kind: FileKind, buf: Buffer): Promise<string | null> {
  switch (kind) {
    case "txt":
    case "csv":
      return cap(buf.toString("utf8"));
    case "docx":
      return cap(await docxText(buf));
    case "xlsx":
      return cap(await xlsxText(buf));
    case "pdf":
      return cap(await pdfText(buf));
    case "png":
    case "jpg":
      return null;
  }
}
