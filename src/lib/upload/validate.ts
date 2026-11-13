export type FileKind = "pdf" | "docx" | "xlsx" | "txt" | "csv" | "png" | "jpg";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 2000;
const MAX_ZIP_UNCOMPRESSED = 50 * 1024 * 1024;

export const MIME: Record<FileKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
};

export class UploadError extends Error {}

function ext(filename: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(filename);
  const e = m?.[1].toLowerCase() ?? "";
  return e === "jpeg" ? "jpg" : e;
}

interface ZipInfo {
  names: string[];
  totalUncompressed: number;
}

/** Reads the zip central directory without inflating anything. */
export function readZipDirectory(buf: Buffer): ZipInfo {
  const minEocd = 22;
  let eocd = -1;
  for (let i = buf.length - minEocd; i >= Math.max(0, buf.length - minEocd - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new UploadError("Corrupt archive");
  const total = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || off === 0xffffffff) throw new UploadError("Unsupported archive");
  if (total > MAX_ZIP_ENTRIES) throw new UploadError("Archive has too many entries");

  const names: string[] = [];
  let totalUncompressed = 0;
  for (let n = 0; n < total; n++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) throw new UploadError("Corrupt archive");
    totalUncompressed += buf.readUInt32LE(off + 24);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    names.push(buf.toString("utf8", off + 46, off + 46 + nameLen));
    off += 46 + nameLen + extraLen + commentLen;
  }
  if (totalUncompressed > MAX_ZIP_UNCOMPRESSED) throw new UploadError("Archive expands too large");
  return { names, totalUncompressed };
}

function looksLikeText(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 8192));
  if (sample.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates an upload by content (magic bytes), not by the claimed MIME type.
 * Returns the verified kind or throws UploadError with a user-safe message.
 */
export function validateUpload(filename: string, buf: Buffer): FileKind {
  if (buf.length === 0) throw new UploadError("File is empty");
  if (buf.length > MAX_UPLOAD_BYTES) throw new UploadError("File is larger than 4 MB");
  const claimed = ext(filename);

  const isPdf = buf.subarray(0, 5).toString("latin1") === "%PDF-";
  const isZip = buf.readUInt32BE(0) === 0x504b0304;
  const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;

  if (claimed === "pdf" && isPdf) return "pdf";
  if (claimed === "png" && isPng) return "png";
  if (claimed === "jpg" && isJpg) return "jpg";

  if ((claimed === "docx" || claimed === "xlsx") && isZip) {
    const { names } = readZipDirectory(buf);
    if (names.some((n) => /vbaproject\.bin$/i.test(n) || /\.(exe|dll|bat|cmd|js|vbs)$/i.test(n))) {
      throw new UploadError("Files containing macros or executables are not allowed");
    }
    const marker = claimed === "docx" ? "word/document.xml" : "xl/workbook.xml";
    if (!names.includes(marker)) throw new UploadError("File content does not match its type");
    return claimed;
  }

  if ((claimed === "txt" || claimed === "csv") && !isPdf && !isZip && !isPng && !isJpg && looksLikeText(buf)) {
    return claimed;
  }

  if (!["pdf", "docx", "xlsx", "txt", "csv", "png", "jpg"].includes(claimed)) {
    throw new UploadError("Allowed types: PDF, DOCX, XLSX, TXT, CSV, PNG, JPG");
  }
  throw new UploadError("File content does not match its type");
}
