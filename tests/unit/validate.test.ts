import { describe, expect, it } from "vitest";
import { validateUpload, UploadError } from "@/lib/upload/validate";

/** Builds a minimal zip whose central directory lists the given entries (data is empty). */
function fakeZip(entries: { name: string; uncompressed?: number }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt32LE(e.uncompressed ?? 0, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

describe("validateUpload", () => {
  it("accepts a real-looking docx", () => {
    expect(validateUpload("q.docx", fakeZip([{ name: "word/document.xml" }]))).toBe("docx");
  });
  it("rejects a PDF renamed to .docx", () => {
    expect(() => validateUpload("q.docx", Buffer.from("%PDF-1.7 ..."))).toThrow(UploadError);
  });
  it("rejects an exe renamed to .pdf", () => {
    expect(() => validateUpload("q.pdf", Buffer.from("MZ\x90\x00 fake exe"))).toThrow(UploadError);
  });
  it("rejects macro-enabled content", () => {
    const z = fakeZip([{ name: "word/document.xml" }, { name: "word/vbaProject.bin" }]);
    expect(() => validateUpload("q.docx", z)).toThrow(/macros/);
  });
  it("rejects zip bombs by declared uncompressed size", () => {
    const z = fakeZip([{ name: "word/document.xml", uncompressed: 60 * 1024 * 1024 }]);
    expect(() => validateUpload("q.docx", z)).toThrow(/too large/);
  });
  it("rejects archives and unknown extensions", () => {
    expect(() => validateUpload("q.zip", fakeZip([{ name: "a" }]))).toThrow(/Allowed types/);
    expect(() => validateUpload("q.docm", fakeZip([{ name: "a" }]))).toThrow(UploadError);
  });
  it("accepts plain text and rejects binary posing as text", () => {
    expect(validateUpload("q.txt", Buffer.from("1. hello"))).toBe("txt");
    expect(() => validateUpload("q.csv", Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]))).toThrow(UploadError);
  });
  it("accepts png/jpg by magic bytes", () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]);
    expect(validateUpload("a.png", png)).toBe("png");
    expect(() => validateUpload("a.jpg", png)).toThrow(UploadError);
  });
});
