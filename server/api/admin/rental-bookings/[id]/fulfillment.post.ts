import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { CATALOG_MEDIA_BUCKET } from "~~/server/utils/catalog-media";
import {
  ADMIN_RENTAL_BOOKING_DETAIL_SELECT,
  fetchAdminCustomerProfile,
  mapAdminRentalBookingDetail,
} from "~~/server/utils/admin-orders";
import type { AdminRentalBookingDetail } from "~~/app/types/admin-order-detail";
import type { RentalBookingStatus } from "~~/app/types/rental-booking";

interface FulfillmentPayload {
  eventType?: "pickup" | "return";
  signatureDataUrl?: string | null;
  notes?: string | null;
}

function parsePngDataUrl(value: string | null | undefined): Buffer | null {
  if (!value) return null;
  const match = /^data:image\/png;base64,(.+)$/i.exec(value);
  if (!match) return null;
  return Buffer.from(match[1], "base64");
}

export default defineEventHandler(
  async (event): Promise<AdminRentalBookingDetail> => {
    const { adminClient, userId } = await requirePlatformAdmin(event);
    const bookingId = getRouterParam(event, "id");
    if (!bookingId) throw createError({ statusCode: 400, statusMessage: "Booking id is required" });

    const body = (await readBody<FulfillmentPayload>(event)) ?? {};
    const eventType = body.eventType;
    if (eventType !== "pickup" && eventType !== "return") {
      throw createError({ statusCode: 400, statusMessage: "eventType must be pickup or return" });
    }
    const statusAfter: RentalBookingStatus = eventType === "pickup" ? "picked_up" : "returned";

    const { data: current, error: currentError } = await adminClient
      .from("rental_bookings")
      .select("id, user_id, status")
      .eq("id", bookingId)
      .maybeSingle();
    if (currentError) throw createError({ statusCode: 500, statusMessage: currentError.message });
    if (!current) throw createError({ statusCode: 404, statusMessage: "Rental booking not found" });

    const currentStatus = String((current as { status: string }).status);
    if (eventType === "pickup" && currentStatus !== "confirmed") {
      throw createError({ statusCode: 422, statusMessage: "Pickup requires a confirmed booking" });
    }
    if (eventType === "return" && currentStatus !== "picked_up") {
      throw createError({ statusCode: 422, statusMessage: "Return requires a picked-up booking" });
    }

    let signatureUrl: string | null = null;
    let signaturePath: string | null = null;
    const signatureBuffer = parsePngDataUrl(body.signatureDataUrl);
    if (signatureBuffer) {
      signaturePath = `rental-fulfillment/${bookingId}/${eventType}-${crypto.randomUUID()}.png`;
      const { error: uploadError } = await adminClient.storage
        .from(CATALOG_MEDIA_BUCKET)
        .upload(signaturePath, signatureBuffer, { contentType: "image/png", upsert: true });
      if (uploadError) throw createError({ statusCode: 500, statusMessage: uploadError.message });
      signatureUrl = adminClient.storage.from(CATALOG_MEDIA_BUCKET).getPublicUrl(signaturePath).data.publicUrl;
    }

    const { error: insertError } = await adminClient.from("rental_booking_fulfillments").insert({
      booking_id: bookingId,
      event_type: eventType,
      status_after: statusAfter,
      signature_url: signatureUrl,
      signature_storage_path: signaturePath,
      notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
      performed_by_user_id: userId,
    });
    if (insertError) throw createError({ statusCode: 500, statusMessage: insertError.message });

    const { data: updated, error: updateError } = await adminClient
      .from("rental_bookings")
      .update({ status: statusAfter })
      .eq("id", bookingId)
      .select(ADMIN_RENTAL_BOOKING_DETAIL_SELECT)
      .single();
    if (updateError) throw createError({ statusCode: 500, statusMessage: updateError.message });

    const customer = await fetchAdminCustomerProfile(
      adminClient,
      String((updated as Record<string, unknown>).user_id ?? ""),
    );
    return mapAdminRentalBookingDetail(updated, customer);
  },
);