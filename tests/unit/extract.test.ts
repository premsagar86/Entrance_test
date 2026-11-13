import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { extractText } from "@/lib/parsers/extract";
import { parseTemplate } from "@/lib/parsers/template";

function minimalPdf(lines: string[]): Buffer {
  const stream = "BT /F1 12 Tf 50 750 Td 14 TL " + lines.map((l) => `(${l.replace(/[()\\]/g, "\\$&")}) Tj T*`).join(" ") + " ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

describe("extractText", () => {
  it("reads questions from an xlsx sheet", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Q");
    ws.addRow(["Question", "A", "B", "C", "D", "Answer"]);
    ws.addRow(["2+2?", "3", "4", "5", "6", "B"]);
    ws.addRow(["Sky colour?", "Blue", "Green", "Red", "Black", ""]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const qs = parseTemplate((await extractText("xlsx", buf))!);
    expect(qs).toHaveLength(2);
    expect(qs[0]).toMatchObject({ text: "2+2?", correctOption: 1 });
    expect(qs[1].correctOption).toBeNull();
  });

  it("reads text from a pdf", async () => {
    const text = await extractText("pdf", minimalPdf(["1. What is 2+2?", "A) 3", "B) 4", "Answer: B"]));
    const qs = parseTemplate(text!);
    expect(qs).toHaveLength(1);
    expect(qs[0]).toMatchObject({ options: ["3", "4"], correctOption: 1 });
  });

  it("returns null for images", async () => {
    expect(await extractText("png", Buffer.alloc(4))).toBeNull();
  });
});
