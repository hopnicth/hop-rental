/**
 * POST /api/admin/rental-bookings/:id/pickup
 *
 * Completes the equipment handover: checklist + customer signature, then the
 * `confirmed` → `picked_up` transition. This is the endpoint the POS V3 pickup
 * screen calls (AdminPosV3PickupContainer.vue).
 *
 * [T-UAT 2b] LAUNCH REGIME — THE DEPOSIT GATE IS DECIDED HERE, NOT IN THE UTIL.
 * The pickup prerequisites refuse a handover unless a booking deposit is paid.
 * At launch deposits are feature-gated off, the deposit is ฿0 and nothing ever
 * marks it paid, so every real handover was refused with 422 "Pickup requires
 * paid deposit/payment status" while the POS panel simultaneously displayed
 * "ชำระครบแล้ว ✓" for the same ฿0 (UAT 2026-09-01, docs/BACKLOG.md T-UAT).
 *
 * ONLY the deposit condition is relaxed. The completed pickup checklist, the
 * customer signature, branch access, the duplicate-event guard, the status
 * guard and the KYC pickup evidence check all still apply — a handover with no
 * signed record is exactly what the raw status button already allows, and this
 * endpoint must not become a second way to do it.
 *
 * Auth:   requirePlatformAdmin (staff + super_admin), branch-scoped downstream.
 * Errors: 400 | 401 | 403 | 404 | 409 | 422 | 500
 */
import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  completeRentalBookingFulfillment,
  type RentalFulfillmentPayload,
} from "~~/server/utils/rental-fulfillment";

/** The one client shape this endpoint needs for the regime read. */
type RegimeReader = {
  rpc: (fn: "f_deposits_enabled") => PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
};

/**
 * Deposit regime, server-authoritative via `f_deposits_enabled()` (mig-135).
 *
 * FAIL-CLOSED, AND NOTE THE DIRECTION — the same direction 2a uses on the
 * checkout endpoint, and the OPPOSITE of the customer DISPLAY reader in
 * customer-rental-booking-detail.ts. An unknown regime must resolve to
 * "deposits ON" so the deposit requirement stays in force; only an explicit
 * `false` relaxes it. A failed lookup can never open a handover gate.
 */
async function depositsAreOff(client: RegimeReader): Promise<boolean> {
  const { data, error } = await client.rpc("f_deposits_enabled");
  if (error) return false;
  return data === false;
}

export default defineEventHandler(async (event) => {
  const { adminClient, userId, platformRole } = await requirePlatformAdmin(event);
  const bookingId = getRouterParam(event, "id");
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: "Booking id is required" });
  }
  const payload = (await readBody<RentalFulfillmentPayload>(event)) ?? {};

  const depositsOff = await depositsAreOff(
    adminClient as unknown as RegimeReader,
  );

  return await completeRentalBookingFulfillment({
    adminClient,
    userId,
    platformRole,
    bookingId,
    eventType: "pickup",
    payload,
    // Only ever relaxed; never set true from here, so the util's own default
    // remains the authority whenever the regime is unknown.
    ...(depositsOff ? { requirePaidPickupDeposit: false } : {}),
  });
});
