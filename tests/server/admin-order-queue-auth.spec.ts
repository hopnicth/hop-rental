import { describe, expect, it, vi } from "vitest";
import { createError } from "h3";

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(async () => {
    throw createError({ statusCode: 403, statusMessage: "Admin access required" });
  }),
}));

vi.mock("~~/server/utils/admin", () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
}));

describe("admin sale order queue endpoint authorization", () => {
  it("rejects non-admin callers via the platform admin guard", async () => {
    const handler = (await import("../../server/api/admin/orders/queue.get")).default;

    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.requirePlatformAdmin).toHaveBeenCalledOnce();
  });
});