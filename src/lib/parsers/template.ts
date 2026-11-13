export interface ParsedQuestion {
  text: string;
  options: string[];
  correctOption: number | null;
  explanation: string | null;
  /** 0..1. Low values are flagged for the admin during review. */
  confidence: number;
}

const QUESTION = /^\s*(?:Q(?:uestion)?\.?\s*)?(\d{1,3})\s*[.):\-]\s*(\S.*)$/i;
const OPTION = /^\s*\(?([A-Fa-f])\s*[.)]\s*(\S.*)$/;
const ANSWER = /^\s*(?:Ans(?:wer)?|Correct(?:\s+Answer)?|Key)\s*[:\-]?\s*\(?([A-Fa-f])\)?\s*(?:[.)].*)?$/i;
const EXPLANATION = /^\s*(?:Explanation|Solution|Reason)\s*[:\-]\s*(.*)$/i;

export const MAX_QUESTIONS = 200;
const MAX_TEXT = 4000;
const MAX_OPTION = 500;

type Field = "text" | "option" | "explanation";

/** Parses text in the common "1. question / A) option / Answer: B" layout. */
export function parseTemplate(input: string): ParsedQuestion[] {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const out: ParsedQuestion[] = [];

  let cur: { text: string; options: string[]; answer: number | null; explanation: string } | null = null;
  let field: Field = "text";

  const flush = () => {
    if (!cur) return;
    const text = cur.text.trim().slice(0, MAX_TEXT);
    const options = cur.options.map((o) => o.trim().slice(0, MAX_OPTION)).filter(Boolean);
    if (text && options.length >= 2) {
      const keyValid = cur.answer !== null && cur.answer < options.length;
      out.push({
        text,
        options: options.slice(0, 6),
        correctOption: keyValid ? cur.answer : null,
        explanation: cur.explanation.trim() ? cur.explanation.trim().slice(0, MAX_TEXT) : null,
        confidence: keyValid ? 0.95 : 0.7,
      });
    } else if (text) {
      // Looks like a question but options were not recognised: keep it, flagged, so nothing is silently lost.
      out.push({ text, options: ["", ""], correctOption: null, explanation: null, confidence: 0.2 });
    }
    cur = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const ans = ANSWER.exec(line);
    if (cur && ans) {
      cur.answer = ans[1].toUpperCase().charCodeAt(0) - 65;
      field = "text";
      continue;
    }
    const exp = EXPLANATION.exec(line);
    if (cur && exp) {
      cur.explanation = exp[1];
      field = "explanation";
      continue;
    }
    const opt = OPTION.exec(line);
    if (cur && opt) {
      cur.options.push(opt[2]);
      field = "option";
      continue;
    }
    const q = QUESTION.exec(line);
    if (q) {
      flush();
      if (out.length >= MAX_QUESTIONS) break;
      cur = { text: q[2], options: [], answer: null, explanation: "" };
      field = "text";
      continue;
    }
    // Continuation of the previous field (wrapped lines).
    if (cur) {
      if (field === "option" && cur.options.length) cur.options[cur.options.length - 1] += ` ${line}`;
      else if (field === "explanation") cur.explanation += ` ${line}`;
      else cur.text += ` ${line}`;
    }
  }
  flush();
  return out.slice(0, MAX_QUESTIONS);
}
