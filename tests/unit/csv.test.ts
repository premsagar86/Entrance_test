import { describe, expect, it } from "vitest";
import { csvCell, parseCsv } from "@/lib/csv";

describe("csv", () => {
  it("parses quoted fields, escaped quotes and CRLF", () => {
    expect(parseCsv('a,b\r\n"x,1","he said ""hi"""\r\n')).toEqual([["a", "b"], ["x,1", 'he said "hi"']]);
  });
  it("skips blank lines and BOM", () => {
    expect(parseCsv("﻿a,b\n\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("neutralises formula injection", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("@x")).toBe("'@x");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("safe")).toBe("safe");
  });
});
