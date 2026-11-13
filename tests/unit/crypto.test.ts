import { describe, expect, it } from "vitest";
import { hashDob, normalizeDob, safeEqual, sha256 } from "@/lib/crypto";

describe("crypto helpers", () => {
  it("normalizes valid DOBs and rejects invalid ones", () => {
    expect(normalizeDob("2005-03-09")).toBe("2005-03-09");
    expect(normalizeDob("2005-02-30")).toBeNull();
    expect(normalizeDob("09/03/2005")).toBeNull();
  });
  it("hashes DOB deterministically per pepper", () => {
    const p = "x".repeat(32);
    expect(hashDob("2005-03-09", p)).toBe(hashDob("2005-03-09", p));
    expect(hashDob("2005-03-09", p)).not.toBe(hashDob("2005-03-09", "y".repeat(32)));
  });
  it("safeEqual handles differing lengths", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
  it("sha256 is stable", () => {
    expect(sha256("a")).toHaveLength(64);
  });
});
