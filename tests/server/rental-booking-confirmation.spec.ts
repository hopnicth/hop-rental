import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateRentalBookingForConfirmation } from "../../server/utils/rental-booking-confirmation";

vi.mock("~~/server/utils/rental-booking-availability", () => ({
  assertRentalBookingAvailability: vi.fn(),
  isRentalBookingConflictError: vi.fn(() => false),
  throwRentalBookingConflict: vi.fn(),
}));

function booking(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking-1",
    user_id: "user-1",
    status: "draft",
    asset_id: "asset-1",
    sku_id: null,
    start_date: "2026-06-01",
    end_date: "2026-06-06",
    rental_days: 5,
    hub_id: "hub-1",
    daily_rate: 100,
    weekly_rate: 0,
    monthly_rate: 0,
    rental_total: 500,
    deposit_amount: 3000,
    currency_code: "THB",
    booking_deposit_payment_status: "unpaid",
    booking_deposit_paid_amount: 0,
    ...overrides,
  };
}

function mockClient(
  input: { heldBalanceEvents?: Record<string, unknown>[] } = {},
) {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const chain = {
        select: () => chain,
        eq: (key: string, value: unknown) => (
          filters.push([key, value]),
          chain
        ),
        maybeSingle: async () => {
          if (table === "store_branches") {
            return { data: { id: "hub-1", is_active: true }, error: null };
          }
          if (table === "assets") {
            return {
              data: {
                id: "asset-1",
                status: "active",
                is_hidden: false,
                currency_code: "THB",
                daily_rate: 100,
                weekly_rate: 0,
                monthly_rate: 0,
                daily_enabled: true,
                weekly_enabled: false,
                monthly_enabled: false,
                deposit_amount: 3000,
                min_rental_days: 1,
                max_rental_days: 0,
              },
              error: null,
            };
          }
          if (table === "rental_held_balance_events") {
            const row = (input.heldBalanceEvents ?? []).find((event) =>
              filters.every(([key, value]) => event[key] === value),
            );
            return { data: row ?? null, error: null };
          }
          return { data: null, error: null };
        },
      };
      return chain;
    },
  };
}

describe("rental booking confirmation Booking Deposit guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects public confirmation when Booking Deposit is not paid", async () => {
    await expect(
      validateRentalBookingForConfirmation({
        adminClient: mockClient() as never,
        booking: booking(),
        userId: "user-1",
        requireBookingDepositPaid: true,
      }),
    ).rejects.toMatchObject({
      statusCode: 402,
      statusMessage: "BOOKING_DEPOSIT_PAYMENT_REQUIRED",
    });
  });

  it("allows payment-success confirmation after Booking Deposit is paid", async () => {
    await expect(
      validateRentalBookingForConfirmation({
        adminClient: mockClient() as never,
        booking: booking({
          booking_deposit_payment_status: "paid",
          booking_deposit_paid_amount: 200,
        }),
        userId: "user-1",
        requireBookingDepositPaid: true,
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects paid compatibility fields without held-balance event in strict canonical path", async () => {
    await expect(
      validateRentalBookingForConfirmation({
        adminClient: mockClient() as never,
        booking: booking({
          booking_deposit_payment_status: "paid",
          booking_deposit_paid_amount: 200,
        }),
        userId: "user-1",
        requireBookingDepositPaid: true,
        requireBookingDepositHeldBalanceEvent: {
          sourceType: "rental_booking_payment_attempt",
          sourceId: "attempt-1",
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "BOOKING_DEPOSIT_HELD_BALANCE_EVENT_REQUIRED",
    });
  });

  it("allows strict canonical confirmation with matching posted held-balance event", async () => {
    await expect(
      validateRentalBookingForConfirmation({
        adminClient: mockClient({
          heldBalanceEvents: [
            {
              rental_booking_id: "booking-1",
              event_type: "booking_deposit_collection",
              amount: 200,
              currency_code: "THB",
              status: "posted",
              source_type: "rental_booking_payment_attempt",
              source_id: "attempt-1",
            },
          ],
        }) as never,
        booking: booking({
          booking_deposit_payment_status: "paid",
          booking_deposit_paid_amount: 200,
        }),
        userId: "user-1",
        requireBookingDepositPaid: true,
        requireBookingDepositHeldBalanceEvent: {
          sourceType: "rental_booking_payment_attempt",
          sourceId: "attempt-1",
        },
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects strict canonical confirmation when held-balance event mismatches", async () => {
    await expect(
      validateRentalBookingForConfirmation({
        adminClient: mockClient({
          heldBalanceEvents: [
            {
              rental_booking_id: "booking-1",
              event_type: "booking_deposit_collection",
              amount: 300,
              currency_code: "THB",
              status: "posted",
              source_type: "rental_booking_payment_attempt",
              source_id: "attempt-1",
            },
          ],
        }) as never,
        booking: booking({
          booking_deposit_payment_status: "paid",
          booking_deposit_paid_amount: 200,
        }),
        userId: "user-1",
        requireBookingDepositPaid: true,
        requireBookingDepositHeldBalanceEvent: {
          sourceType: "rental_booking_payment_attempt",
          sourceId: "attempt-1",
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: "BOOKING_DEPOSIT_HELD_BALANCE_EVENT_MISMATCH",
    });
  });

  it("preserves admin/POS/internal bypass when explicitly requested", async () => {
    await expect(
      validateRentalBookingForConfirmation({
        adminClient: mockClient() as never,
        booking: booking(),
        userId: "user-1",
        requireBookingDepositPaid: true,
        requireBookingDepositHeldBalanceEvent: {
          sourceType: "rental_booking_payment_attempt",
          sourceId: "attempt-1",
        },
        bypassBookingDepositRequirement: true,
      }),
    ).resolves.toBeUndefined();
  });

  it("keeps current zero Booking Deposit due limitation for paid-required path", async () => {
    await expect(
      validateRentalBookingForConfirmation({
        adminClient: mockClient() as never,
        booking: booking({
          deposit_amount: 0,
          booking_deposit_payment_status: "paid",
          booking_deposit_paid_amount: 0,
        }),
        userId: "user-1",
        requireBookingDepositPaid: true,
      }),
    ).rejects.toMatchObject({
      statusCode: 402,
      statusMessage: "BOOKING_DEPOSIT_PAYMENT_REQUIRED",
    });
  });

  it("keeps existing internal default confirmation behavior valid", async () => {
    await expect(
      validateRentalBookingForConfirmation({
        adminClient: mockClient() as never,
        booking: booking(),
        userId: "user-1",
      }),
    ).resolves.toBeUndefined();
  });

  it("validates a same-day customer rental stored as a one-day internal range", async () => {
    await expect(
      validateRentalBookingForConfirmation({
        adminClient: mockClient() as never,
        booking: booking({
          start_date: "2026-05-21",
          end_date: "2026-05-22",
          rental_days: 1,
          rental_total: 100,
        }),
        userId: "user-1",
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects mismatched rental days for the stored internal range", async () => {
    await expect(
      validateRentalBookingForConfirmation({
        adminClient: mockClient() as never,
        booking: booking({
          start_date: "2026-05-21",
          end_date: "2026-05-22",
          rental_days: 2,
          rental_total: 200,
        }),
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "Booking rental days do not match selected dates",
    });
  });
});
