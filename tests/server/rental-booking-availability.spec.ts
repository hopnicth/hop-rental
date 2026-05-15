import { describe, expect, it } from "vitest";
import {
  assertRentalBookingAvailability,
  isRentalBookingConflictError,
} from "../../server/utils/rental-booking-availability";

function mockClient(result: {
  data?: unknown[];
  error?: { message: string } | null;
}) {
  const calls: Array<[string, ...unknown[]]> = [];
  const query = {
    select: (...args: unknown[]) => (calls.push(["select", ...args]), query),
    in: (...args: unknown[]) => (calls.push(["in", ...args]), query),
    lt: (...args: unknown[]) => (calls.push(["lt", ...args]), query),
    gt: (...args: unknown[]) => (calls.push(["gt", ...args]), query),
    limit: (...args: unknown[]) => (calls.push(["limit", ...args]), query),
    eq: (...args: unknown[]) => (calls.push(["eq", ...args]), query),
    is: (...args: unknown[]) => (calls.push(["is", ...args]), query),
    neq: (...args: unknown[]) => (calls.push(["neq", ...args]), query),
    then: (resolve: (value: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return {
    calls,
    client: { from: (table: string) => (calls.push(["from", table]), query) },
  };
}

describe("rental booking availability", () => {
  it("allows a period with no blocking overlap", async () => {
    const { client, calls } = mockClient({ data: [], error: null });

    await expect(
      assertRentalBookingAvailability(client, {
        assetId: "asset-1",
        startDate: "2026-05-10",
        endDate: "2026-05-12",
      }),
    ).resolves.toBeUndefined();

    expect(calls).toContainEqual(["eq", "asset_id", "asset-1"]);
    expect(calls).toContainEqual(["in", "status", ["confirmed", "picked_up"]]);
    expect(calls).toContainEqual(["lt", "start_date", "2026-05-12"]);
    expect(calls).toContainEqual(["gt", "end_date", "2026-05-10"]);
  });

  it("does not include no_show in blocking availability statuses", async () => {
    const { client, calls } = mockClient({ data: [], error: null });

    await assertRentalBookingAvailability(client, {
      assetId: "asset-1",
      startDate: "2026-05-10",
      endDate: "2026-05-12",
    });

    const statusCall = calls.find(
      (call) => call[0] === "in" && call[1] === "status",
    );
    expect(statusCall?.[2]).toEqual(["confirmed", "picked_up"]);
    expect(statusCall?.[2]).not.toContain("no_show");
  });

  it("checks same-day customer rentals as one-day internal half-open ranges", async () => {
    const { client, calls } = mockClient({ data: [], error: null });

    await expect(
      assertRentalBookingAvailability(client, {
        assetId: "asset-1",
        startDate: "2026-05-21",
        endDate: "2026-05-22",
      }),
    ).resolves.toBeUndefined();

    expect(calls).toContainEqual(["lt", "start_date", "2026-05-22"]);
    expect(calls).toContainEqual(["gt", "end_date", "2026-05-21"]);
  });

  it("allows adjacent internal half-open ranges", async () => {
    const { client, calls } = mockClient({ data: [], error: null });

    await assertRentalBookingAvailability(client, {
      assetId: "asset-1",
      startDate: "2026-05-22",
      endDate: "2026-05-23",
    });

    expect(calls).toContainEqual(["lt", "start_date", "2026-05-23"]);
    expect(calls).toContainEqual(["gt", "end_date", "2026-05-22"]);
  });

  it("rejects an overlapping blocking booking", async () => {
    const { client } = mockClient({ data: [{ id: "booking-1" }], error: null });

    await expect(
      assertRentalBookingAvailability(client, {
        assetId: "asset-1",
        startDate: "2026-05-10",
        endDate: "2026-05-12",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects same-day-equivalent internal overlaps", async () => {
    const { client } = mockClient({ data: [{ id: "booking-1" }], error: null });

    await expect(
      assertRentalBookingAvailability(client, {
        assetId: "asset-1",
        startDate: "2026-05-21",
        endDate: "2026-05-22",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("detects database-level overlap conflicts", () => {
    expect(
      isRentalBookingConflictError({
        code: "23P01",
        message: "RENTAL_BOOKING_CONFLICT",
      }),
    ).toBe(true);
  });
});
