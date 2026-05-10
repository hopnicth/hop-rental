import { createError, defineEventHandler, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";

type PosHistoryType = "sale" | "rental";
type Row = Record<string, unknown>;

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isPaidLike(value: unknown): boolean {
  return ["paid", "partial_refund", "pending_review"].includes(asText(value));
}

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const body = ((await readBody(event)) ?? {}) as {
    id?: unknown;
    type?: unknown;
  };
  const id = asText(body.id);
  const type = asText(body.type) as PosHistoryType;

  if (!id || (type !== "sale" && type !== "rental")) {
    throw createError({
      statusCode: 422,
      statusMessage: "type and id are required",
    });
  }

  if (type === "sale") {
    const { data, error } = await adminClient.rpc("f_cancel_pos_sale", {
      p_order_id: id,
    });
    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message });
    }
    const result = (data && typeof data === "object" ? data : {}) as Row;
    return {
      ok: true,
      type,
      id,
      status: "cancelled",
      inventoryWasApplied: result.inventoryWasApplied === true,
      inventoryAlreadyReversed: result.inventoryAlreadyReversed === true,
      inventoryRestocked: result.inventoryRestocked === true,
      restockedQuantity: Number(result.restockedQuantity ?? 0),
      inventoryReversalRequired: false,
    };
  }

  const { data, error } = await adminClient
    .from("rental_bookings")
    .select("id, status, pos_branch_id, deposit_payment_status")
    .eq("id", id)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  const booking = (data ?? null) as Row | null;
  if (!booking)
    throw createError({
      statusCode: 404,
      statusMessage: "POS rental not found",
    });
  if (!asText(booking.pos_branch_id)) {
    throw createError({
      statusCode: 422,
      statusMessage: "Only POS rentals can be cancelled here",
    });
  }

  const currentStatus = asText(booking.status);
  if (["picked_up", "returned"].includes(currentStatus)) {
    throw createError({
      statusCode: 422,
      statusMessage: "Cannot cancel rental after pickup/return",
    });
  }
  if (currentStatus !== "cancelled") {
    const { error: updateError } = await adminClient
      .from("rental_bookings")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (updateError) {
      throw createError({
        statusCode: 500,
        statusMessage: updateError.message,
      });
    }
  }

  return {
    ok: true,
    type,
    id,
    status: "cancelled",
    refundRequired: isPaidLike(booking.deposit_payment_status),
  };
});
