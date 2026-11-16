/**
 * POST /api/user/manual-payment-requests
 *
 * Create (or reuse) ONE central manual payment request from the checkout targets
 * the cart already created: an unpaid sale order and/or draft rental booking(s).
 * Computes authoritative amounts server-side, creates the request + allocation
 * items, and returns the id so the customer can be routed to
 * `/user/payments/[paymentRequestId]`.
 *
 * Auth:    serverSupabaseUser + ownership on the order and every booking.
 * Body:    { orderId?: string, bookingIds?: string[], customerNote?: string }
 * Returns: { paymentRequestId: string | null, reused: boolean, redirectTo: string,
 *            confirmedBookingIds: string[] }
 * Errors:  400 | 401 | 403 | 404 | 422 | 500
 *
 * EVIDENCE ONLY. The sale order stays unpaid/awaiting_payment. No inventory
 * deduction, no held balance, no Omise/KYC.
 *
 * [T-UAT 2a] LAUNCH REGIME — THE DEPOSIT-OFF BRANCH LIVES HERE, NOT IN THE UTIL.
 * With deposits feature-gated off the booking deposit is ฿0, so every rental
 * target was skipped and the request came out empty — the util then refused the
 * whole checkout with 422 NO_AMOUNT_DUE_FOR_TARGETS and the customer could not
 * book at all (UAT 2026-09-01, docs/BACKLOG.md T-UAT).
 *
 * At launch there is nothing to pay up front, so there is nothing to evidence:
 * the booking is simply CONFIRMED here and the rental is collected at return.
 * This orchestration deliberately sits in the endpoint because
 * `manual-payment-request.ts` documents the invariant that it NEVER confirms a
 * booking — that invariant is why review/reject may only advance evidence state,
 * and it stays intact.
 *
 * NO FICTION: `confirmRentalBooking` writes exactly ONE thing, the booking status
 * flip. No held-balance event, no ledger row, no payment row, no deposit-era
 * document is written for a ฿0 deposit (batch-1 no-fiction principle). A test
 * pins this.
 */
import { createError, defineEventHandler, readBody } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { createManualPaymentRequestFromTargets } from "~~/server/utils/manual-payment-request";
import { confirmRentalBooking } from "~~/server/utils/rental-booking-confirmation";

/** The one client shape this endpoint needs for the regime read. */
type RegimeReader = {
  rpc: (fn: "f_deposits_enabled") => PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
};

type TableClient = { from: (table: string) => any };

/**
 * [T-UAT 2a] Assign the pickup hub the customer chose in the cart.
 *
 * The cart is the LAST decision point, so its choice wins and overwrites any
 * hub already on the booking. The client-supplied id is NEVER trusted: the
 * branch must exist and be active, and the asset must actually be carried at
 * that branch, or the checkout is refused.
 *
 * This exists because nothing in the customer path ever assigned a hub —
 * RentalBookingForm.vue does not set one and the cart's branch control only
 * FILTERED by it — so `confirmRentalBooking` refused every real booking with
 * "Pickup hub is required" (found at 2a live verification, 2026-10-28).
 *
 * `hub_name` is written alongside the id because /user/rentals renders
 * `booking.hubName`; without it the card reads "ยังไม่ได้เลือกจุดรับสินค้า" on a
 * booking that does have a hub.
 */
async function assignPickupHub(
  client: TableClient,
  bookingIds: string[],
  hubId: string,
): Promise<void> {
  const { data: branch, error: branchError } = await client
    .from("store_branches")
    .select("id, name_th, is_active")
    .eq("id", hubId)
    .maybeSingle();
  if (branchError) {
    throw createError({ statusCode: 500, statusMessage: branchError.message });
  }
  if (!branch || branch.is_active !== true) {
    throw createError({
      statusCode: 422,
      statusMessage: "PICKUP_HUB_NOT_AVAILABLE",
    });
  }

  for (const bookingId of bookingIds) {
    const { data: booking, error: bookingError } = await client
      .from("rental_bookings")
      .select("id, asset_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError) {
      throw createError({
        statusCode: 500,
        statusMessage: bookingError.message,
      });
    }
    if (!booking) {
      throw createError({ statusCode: 404, statusMessage: "Booking not found" });
    }

    // The asset must be CARRIED at this branch. Deliberately not `available > 0`:
    // that is a point-in-time count and the booking is for future dates, so a
    // momentary zero would wrongly refuse a legitimate checkout. Date-range
    // availability is the booking calendar's job, not this gate's.
    const { data: stock, error: stockError } = await client
      .from("asset_branch_inventory")
      .select("id")
      .eq("asset_id", String(booking.asset_id ?? ""))
      .eq("branch_id", hubId)
      .maybeSingle();
    if (stockError) {
      throw createError({ statusCode: 500, statusMessage: stockError.message });
    }
    if (!stock) {
      throw createError({
        statusCode: 422,
        statusMessage: "ASSET_NOT_AT_PICKUP_HUB",
      });
    }

    const { error: updateError } = await client
      .from("rental_bookings")
      .update({ hub_id: hubId, hub_name: String(branch.name_th ?? "") })
      .eq("id", bookingId)
      .eq("status", "draft");
    if (updateError) {
      throw createError({
        statusCode: 500,
        statusMessage: updateError.message,
      });
    }
  }
}

/**
 * Deposit regime, server-authoritative via `f_deposits_enabled()` (mig-135).
 *
 * FAIL-CLOSED, AND NOTE THE DIRECTION: it is the OPPOSITE of the customer
 * DISPLAY reader in customer-rental-booking-detail.ts. There, an unknown regime
 * resolves to false so no deposit claim is ever shown. Here, an unknown regime
 * must resolve to "deposits ON" so checkout keeps TODAY's behaviour and we never
 * confirm a booking for free because a lookup failed. Only an explicit `false`
 * from the RPC relaxes the deposit requirement.
 */
async function depositsAreOff(client: RegimeReader): Promise<boolean> {
  const { data, error } = await client.rpc("f_deposits_enabled");
  if (error) return false;
  return data === false;
}

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = authUser?.id ?? authUser?.sub;
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const body = (await readBody(event)) as Record<string, unknown>;
  const orderId = typeof body.orderId === "string" ? body.orderId : null;
  const bookingIds = Array.isArray(body.bookingIds)
    ? body.bookingIds.filter((b): b is string => typeof b === "string")
    : [];
  const customerNote =
    typeof body.customerNote === "string" ? body.customerNote : null;
  const pickupHubId =
    typeof body.pickupHubId === "string" && body.pickupHubId.trim().length > 0
      ? body.pickupHubId.trim()
      : null;

  const client = serverSupabaseServiceRole(event);

  // [T-UAT 2a] Rental targets are confirmed outright when deposits are off —
  // ALWAYS, whether or not a sale target rides along. A mixed cart still has a
  // payable sale amount, so it would never have hit the 422; its bookings would
  // simply have been left draft forever. Gating this on "the request came out
  // empty" would have shipped that silent variant of the same bug.
  const confirmedBookingIds: string[] = [];
  let remainingBookingIds = bookingIds;
  if (bookingIds.length > 0 && (await depositsAreOff(client))) {
    // The cart is the last decision point for where the customer collects, so
    // its choice is written (and overwrites any earlier hub) before confirming.
    if (pickupHubId) {
      await assignPickupHub(client, bookingIds, pickupHubId);
    }
    for (const bookingId of bookingIds) {
      await confirmRentalBooking({
        adminClient: client,
        bookingId,
        userId: String(userId),
        // The deposit is ฿0 and uncollectable at launch; every other guard in
        // validateRentalBookingForConfirmation (ownership, pricing, dates,
        // branch, asset) still runs unchanged.
        requireBookingDepositPaid: false,
      });
      confirmedBookingIds.push(bookingId);
    }
    remainingBookingIds = [];
  }

  // Nothing payable left: no sale order, and the bookings are already confirmed.
  // Creating a request here would be an empty one, which is exactly the 422.
  if (!orderId && remainingBookingIds.length === 0) {
    if (confirmedBookingIds.length === 0) {
      throw createError({
        statusCode: 422,
        statusMessage: "NO_CHECKOUT_TARGETS",
      });
    }
    return {
      paymentRequestId: null,
      reused: false,
      redirectTo: "/user/rentals",
      confirmedBookingIds,
    };
  }

  const { paymentRequestId, reused } =
    await createManualPaymentRequestFromTargets(client, {
      userId: String(userId),
      orderId,
      bookingIds: remainingBookingIds,
      customerNote,
    });

  return {
    paymentRequestId,
    reused,
    redirectTo: `/user/payments/${paymentRequestId}`,
    confirmedBookingIds,
  };
});
