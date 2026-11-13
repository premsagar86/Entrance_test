import { MIME, type FileKind } from "../upload/validate";
import { extractText } from "./extract";
import { extractWithGeminiFile, extractWithGeminiText, geminiEnabled } from "./gemini";
import { parseTemplate, type ParsedQuestion } from "./template";

export class ParseError extends Error {}

export interface ParseResult {
  questions: ParsedQuestion[];
  method: "template" | "ai";
}

/** Template parser first (free, deterministic); Gemini only as fallback or for images/scans. */
export async function parseDocument(kind: FileKind, buf: Buffer): Promise<ParseResult> {
  const text = await extractText(kind, buf);

  if (text !== null) {
    const viaTemplate = parseTemplate(text);
    const usable = viaTemplate.filter((q) => q.confidence >= 0.5);
    if (usable.length > 0) return { questions: viaTemplate, method: "template" };
    if (geminiEnabled() && text.trim().length > 20) {
      return { questions: await extractWithGeminiText(text), method: "ai" };
    }
    // Scanned PDF: no text layer, send the file itself to vision.
    if (geminiEnabled() && kind === "pdf") {
      return { questions: await extractWithGeminiFile(MIME.pdf, buf), method: "ai" };
    }
    throw new ParseError(
      geminiEnabled()
        ? "No questions found in this document."
        : "No questions found. Use the format '1. Question / A) option / Answer: B', or configure the AI fallback.",
    );
  }

  // Images need vision.
  if (!geminiEnabled()) throw new ParseError("Images need the AI fallback, which is not configured.");
  return { questions: await extractWithGeminiFile(MIME[kind], buf), method: "ai" };
}
