import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import {
  expireMixedCheckoutIfNeeded,
  getMixedCheckoutUserId,
  isMixedCheckoutEnabled,
  mixedCheckoutDisabledError,
} from "~~/server/utils/mixed-checkout";

export default defineEventHandler(async (event) => {
  if (!isMixedCheckoutEnabled(useRuntimeConfig(event))) {
    mixedCheckoutDisabledError();
  }

  const user = await serverSupabaseUser(event);
  const userId = getMixedCheckoutUserId(user);
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  const sessionId = getRouterParam(event, "sessionId");
  if (!sessionId) {
    throw createError({
      statusCode: 400,
      statusMessage: "sessionId is required",
    });
  }

  const client = serverSupabaseServiceRole(event);
  const { data: session, error: sessionError } = await client
    .from("mixed_checkout_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (sessionError) {
    throw createError({ statusCode: 500, statusMessage: sessionError.message });
  }
  if (!session) {
    throw createError({
      statusCode: 404,
      statusMessage: "Mixed checkout session not found",
    });
  }

  const normalizedSession = await expireMixedCheckoutIfNeeded(client, session);

  const { data: attempts, error: attemptsError } = await client
    .from("mixed_payment_attempts")
    .select("*")
    .eq("mixed_checkout_session_id", sessionId)
    .order("created_at", { ascending: false });
  if (attemptsError) {
    throw createError({
      statusCode: 500,
      statusMessage: attemptsError.message,
    });
  }

  const { data: allocations, error: allocationsError } = await client
    .from("mixed_payment_allocations")
    .select("*")
    .eq("mixed_checkout_session_id", sessionId)
    .order("created_at", { ascending: true });
  if (allocationsError) {
    throw createError({
      statusCode: 500,
      statusMessage: allocationsError.message,
    });
  }

  const saleOrderId = normalizedSession.sale_order_id;
  const { data: saleOrder } = saleOrderId
    ? await client
        .from("orders")
        .select("id, status, payment_status, fulfillment_status")
        .eq("id", saleOrderId)
        .maybeSingle()
    : { data: null };

  const bookingIds = [
    ...new Set(
      (allocations ?? [])
        .filter((allocation: Record<string, unknown>) =>
          Boolean(allocation.rental_booking_id),
        )
        .map((allocation: Record<string, unknown>) =>
          String(allocation.rental_booking_id),
        ),
    ),
  ];
  let rentalBookings: Record<string, unknown>[] = [];
  if (bookingIds.length) {
    const bookingResult = await client
      .from("rental_bookings")
      .select(
        "id, status, booking_deposit_payment_status, booking_deposit_paid_amount, booking_deposit_confirm_failure_reason",
      )
      .in("id", bookingIds);

    if (bookingResult.error) {
      const message = String(bookingResult.error.message ?? "");
      if (!message.includes("booking_deposit_payment_status")) {
        throw createError({ statusCode: 500, statusMessage: message });
      }

      // Compatibility guard for environments that have not yet applied the
      // Booking Deposit payment migration. The follow-up migration re-adds the
      // missing columns; until then, do not make the status page fail with 500.
      const fallbackResult = await client
        .from("rental_bookings")
        .select("id, status")
        .in("id", bookingIds);
      if (fallbackResult.error) {
        throw createError({
          statusCode: 500,
          statusMessage: fallbackResult.error.message,
        });
      }
      rentalBookings = (fallbackResult.data ?? []).map(
        (booking: Record<string, unknown>) => ({
          ...booking,
          booking_deposit_payment_status: null,
          booking_deposit_paid_amount: null,
          booking_deposit_confirm_failure_reason: null,
        }),
      );
    } else {
      rentalBookings = bookingResult.data ?? [];
    }
  }

  return {
    ok: true,
    session: normalizedSession,
    latestAttempt: attempts?.[0] ?? null,
    attempts: attempts ?? [],
    allocations: allocations ?? [],
    saleOrder: saleOrder ?? null,
    rentalBookings,
  };
});
