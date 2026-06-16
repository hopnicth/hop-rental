/**
 * POST /api/user/rental-bookings/:id/deposit-slip
 *
 * Customer uploads a bank-transfer SLIP as deposit evidence for THEIR OWN
 * rental booking (manual bank-transfer flow). Evidence only — this NEVER
 * confirms the booking and NEVER mutates money: the slip is recorded with
 * status 'pending_review' and an admin must still mark the deposit received.
 *
 * Auth:    serverSupabaseUser (authenticated customer) + ownership check
 *          (booking.user_id === session user).
 * Input:   multipart/form-data with one file part (image/jpeg|png or pdf).
 * Returns: { slip: SafeRentalDepositSlip } — never a URL / storage path.
 * Errors:  400 | 401 | 403 | 404 | 413 | 415 | 422 | 500
 *
 * Eligible booking status: 'draft' only (the booking stays unconfirmed while a
 * slip is pending review). Confirmed / picked_up / returned / cancelled /
 * no_show are rejected (422).
 *
 * Storage: the file goes to the PRIVATE rental-deposit-slips bucket via the
 * deposit-slip-evidence util. Never catalog-media. Never a public URL.
 */
import {
  createError,
  defineEventHandler,
  getRouterParam,
  readMultipartFormData,
} from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import {
  asUuidOrNull,
  uploadRentalDepositSlipEvidence,
  type RentalDepositSlipClient,
} from "~~/server/utils/rental-deposit-slip-evidence";

/** Booking statuses from which a customer may still upload deposit evidence. */
const SLIP_UPLOAD_ELIGIBLE_STATUSES = new Set(["draft"]);

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = authUser?.id ?? authUser?.sub;
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const bookingId = asUuidOrNull(getRouterParam(event, "id"));
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: "INVALID_BOOKING_ID" });
  }

  const client = serverSupabaseServiceRole(event);

  // ── Load booking for ownership + eligibility (lightweight select) ──────────
  const { data: booking, error: bookingError } = await client
    .from("rental_bookings")
    .select("id, user_id, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) {
    console.error(
      "[rental] deposit slip booking read failed",
      bookingError.message,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "BOOKING_READ_FAILED",
    });
  }
  if (!booking) {
    throw createError({ statusCode: 404, statusMessage: "Booking not found" });
  }

  // Ownership — enforced in application code (service-role bypasses RLS).
  if (String(booking.user_id ?? "") !== String(userId)) {
    throw createError({ statusCode: 403, statusMessage: "Access denied" });
  }

  // Eligibility — only an unconfirmed (draft) booking can receive evidence.
  if (!SLIP_UPLOAD_ELIGIBLE_STATUSES.has(String(booking.status ?? ""))) {
    throw createError({
      statusCode: 422,
      statusMessage: "BOOKING_NOT_ELIGIBLE_FOR_SLIP_UPLOAD",
    });
  }

  // ── Read the uploaded file ────────────────────────────────────────────────
  const parts = await readMultipartFormData(event);
  const file = parts?.find((part) => part.filename && part.data);
  if (!file?.data) {
    throw createError({
      statusCode: 400,
      statusMessage: "SLIP_FILE_REQUIRED",
    });
  }

  // Validation (size / magic-byte MIME), private upload, and metadata insert
  // all happen in the util. It never returns a URL and never mutates money.
  const slip = await uploadRentalDepositSlipEvidence(
    client as unknown as RentalDepositSlipClient,
    {
      bookingId,
      uploadedBy: String(userId),
      fileBytes: Buffer.from(file.data),
      originalFilename: file.filename,
    },
  );

  return { slip };
});
