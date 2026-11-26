import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  finalizeAttempt: vi.fn(),
  findMany: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("@/lib/attempts", () => ({ finalizeAttempt: mocks.finalizeAttempt }));
vi.mock("@/lib/db", () => ({
  db: {
    attempt: { findMany: mocks.findMany },
    session: { deleteMany: mocks.deleteMany },
    otpCode: { deleteMany: mocks.deleteMany },
    rateLimit: { deleteMany: mocks.deleteMany },
  },
}));

import { cleanupAttempts } from "@/lib/cleanup";

describe("cleanupAttempts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    mocks.deleteMany.mockResolvedValue({ count: 2 });
  });

  it("keeps going after one attempt fails and reports it", async () => {
    mocks.finalizeAttempt.mockImplementation(async (id: string) => {
      if (id === "b") throw new Error("boom");
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await cleanupAttempts();

    expect(mocks.finalizeAttempt.mock.calls.map((c) => c[0])).toEqual(["a", "b", "c"]);
    expect(result).toEqual({ expiredAttempts: 2, failed: 1, sessions: 2, otps: 2, rateLimits: 2 });
    expect(mocks.deleteMany).toHaveBeenCalledTimes(3);
    log.mockRestore();
  });

  it("reports no failures when every attempt finalizes", async () => {
    mocks.finalizeAttempt.mockResolvedValue(undefined);
    expect(await cleanupAttempts()).toMatchObject({ expiredAttempts: 3, failed: 0 });
  });
});
