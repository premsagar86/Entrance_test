import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp } from "@/lib/http";

const req = (headers: Record<string, string>) => new Request("https://exam.test/", { headers });

afterEach(() => vi.unstubAllEnvs());

describe("clientIp", () => {
  it("uses x-real-ip by default and ignores headers a visitor can send", () => {
    expect(clientIp(req({ "x-real-ip": "203.0.113.7", "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("203.0.113.7");
  });

  it("does not trust cf-connecting-ip unless configured", () => {
    expect(clientIp(req({ "cf-connecting-ip": "1.1.1.1" }))).toBe("unknown");
  });

  it("uses the header named by CLIENT_IP_HEADER", () => {
    vi.stubEnv("CLIENT_IP_HEADER", "cf-connecting-ip");
    expect(clientIp(req({ "cf-connecting-ip": "198.51.100.4", "x-real-ip": "1.1.1.1" }))).toBe("198.51.100.4");
  });

  it("falls back to the last x-forwarded-for entry, not the visitor-controlled first one", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("returns unknown without any address header", () => {
    expect(clientIp(req({}))).toBe("unknown");
  });
});
