/**
 * GET /api/admin/rental-bookings/:id/overdue-report
 *
 * Feed for the OVERDUE & ADJUSTMENTS REPORT — the printable sheet Admin bills
 * from, now that the web collects only the booked rental (decisions.md
 * 2026-07-27).
 *
 * THIS IS NOT A DOCUMENT. It has no `official_documents` row, no document
 * number, no series, and consumes no sequence. It is an internal billing aid;
 * the tax document for the rental is issued separately by the mig-068 engine.
 *
 * SIX FIELDS, EXACTLY — the CHiP-ratified layout (2026-07-27):
 *   booking number · customer (name + phone) · rental dates as booked + the
 *   actual return date · days overdue · daily rate AS BOOKED · staff memo.
 *
 * [AMENDED 2026-08-27] Plus the SIGNATURE BLOCK, ruling (ก): the report reuses
 * the DIGITAL signature already captured when the customer confirmed the RETURN.
 * It never prints a blank signature line — the customer must not sign twice, and
 * must never appear to have signed THIS sheet, which they have not seen.
 *
 * WHICH SIGNATURE, and why this one: `rental_booking_settlements` is APPEND-ONLY
 * (mig-125 `trg_rental_booking_settlements_no_mutate` blocks UPDATE and DELETE),
 * so the `customer_signature_path` bound to this booking's settlement cannot be
 * swapped or cleared after the fact. The same signature also lands on
 * `rental_booking_fulfillments`, which carries the `booking_checklist_id` link
 * but has NO append-only trigger — so the settlement row is the integrity-bearing
 * copy and the fulfillment supplies the confirmation TIMESTAMP.
 *
 * The image lives in the PRIVATE `rental-deposit-slips` bucket and is served as a
 * short-lived signed URL, never a public link.
 *
 * NO COMPUTED TOTAL. The endpoint deliberately returns no amount beyond the
 * booked daily rate: the moment this sheet multiplies rate by days, the web has
 * written a bill, which is the thing the ruling removes. The accounting program
 * does the arithmetic.
 *
 * Auth: requirePlatformAdmin.
 * Errors: 400 | 401 | 403 | 404 (no settlement, or the return was not late)
 */
import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { RENTAL_DEPOSIT_SLIP_BUCKET } from "~~/server/utils/rental-deposit-slip-evidence";

/** Long enough to load and print, short enough that a printed URL is useless. */
const SIGNATURE_SIGNED_URL_TTL_SECONDS = 300;

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const bookingId = getRouterParam(event, "id");
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: "id is required" });
  }

  const { data: booking, error: bookingError } = await adminClient
    .from("rental_bookings")
    .select("id, booker_name, booker_phone, start_date, end_date, daily_rate, currency_code")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) {
    throw createError({ statusCode: 500, statusMessage: bookingError.message });
  }
  if (!booking) {
    throw createError({ statusCode: 404, statusMessage: "Booking not found" });
  }

  const { data: settlement, error: settlementError } = await adminClient
    .from("rental_booking_settlements")
    .select(
      "late_days, staff_memo, created_at, customer_signature_path, created_by_user_id",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (settlementError) {
    throw createError({
      statusCode: 500,
      statusMessage: settlementError.message,
    });
  }
  // The report exists only for a SETTLED, LATE return: before settlement there
  // is no recorded overdue fact, and an on-time return has nothing to bill.
  if (!settlement || Number(settlement.late_days ?? 0) <= 0) {
    throw createError({
      statusCode: 404,
      statusMessage: "No overdue return recorded for this booking",
    });
  }

  // The RETURN confirmation event: it carries the checklist link and the moment
  // the customer actually signed. Absent only for legacy/edge rows.
  const { data: fulfillment } = await adminClient
    .from("rental_booking_fulfillments")
    .select("event_at, created_at, booking_checklist_id")
    .eq("booking_id", bookingId)
    .eq("event_type", "return")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Customer signature — signed URL over the PRIVATE bucket. Any failure yields
  // null, and the sheet then prints "no signature on record" rather than an
  // empty line that would invite a pen signature (ruling ก).
  let signatureUrl: string | null = null;
  const signaturePath = String(settlement.customer_signature_path ?? "");
  if (signaturePath && adminClient.storage) {
    const { data: signed } = await adminClient.storage
      .from(RENTAL_DEPOSIT_SLIP_BUCKET)
      .createSignedUrl(signaturePath, SIGNATURE_SIGNED_URL_TTL_SECONDS);
    signatureUrl = signed?.signedUrl ?? null;
  }

  let staffName = "";
  const staffId = String(settlement.created_by_user_id ?? "");
  if (staffId) {
    const { data: staff } = await adminClient
      .from("users")
      .select("full_name")
      .eq("id", staffId)
      .maybeSingle();
    staffName = String(staff?.full_name ?? "");
  }

  return {
    bookingNumber: booking.id,
    customerName: booking.booker_name ?? "",
    customerPhone: booking.booker_phone ?? "",
    bookedStartDate: booking.start_date,
    bookedEndDate: booking.end_date,
    actualReturnDate: settlement.created_at,
    lateDays: Number(settlement.late_days ?? 0),
    dailyRateAsBooked: Number(booking.daily_rate ?? 0),
    currencyCode: booking.currency_code ?? "THB",
    staffMemo: settlement.staff_memo ?? "",
    // [AMENDED 2026-08-27] Signature block. `signedAt` is the RETURN confirmation
    // moment, so the caption can attribute the signature to what was actually
    // signed — never to this report.
    customerSignature: signatureUrl
      ? {
          url: signatureUrl,
          signedAt:
            fulfillment?.event_at ??
            fulfillment?.created_at ??
            settlement.created_at,
        }
      : null,
    recordedByStaffName: staffName,
    recordedAt: settlement.created_at,
  };
});
