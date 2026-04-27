import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { loadBookingOpsPayload } from "~~/server/utils/admin-bookings-ops";
import type {
  AdminBookingOpsPayload,
  CreateChecklistAdHocPayload,
  CreateChecklistFromTemplatePayload,
  RentalChecklistKind,
} from "~~/app/types/admin-booking-ops";

const VALID_KINDS: RentalChecklistKind[] = [
  "pickup",
  "return",
  "inspection",
  "service",
];

type CreatePayload = Partial<
  CreateChecklistFromTemplatePayload & CreateChecklistAdHocPayload
>;

export default defineEventHandler(
  async (event): Promise<AdminBookingOpsPayload> => {
    const { adminClient, userId } = await requirePlatformAdmin(event);
    const bookingId = getRouterParam(event, "id");
    if (!bookingId) {
      throw createError({
        statusCode: 400,
        statusMessage: "Booking id is required",
      });
    }

    const body = (await readBody<CreatePayload>(event)) ?? {};

    const { data: booking, error: bookingError } = await adminClient
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
    const assetId = (booking as { asset_id: string | null }).asset_id;
    if (!assetId) {
      throw createError({
        statusCode: 422,
        statusMessage: "Booking has no asset_id; cannot create checklist",
      });
    }

    let checklistId: string;
    if (body.templateId) {
      const { data: tpl, error: tplErr } = await adminClient
        .from("asset_checklist_templates")
        .select("id, kind, name, version, asset_id")
        .eq("id", body.templateId)
        .eq("asset_id", assetId)
        .maybeSingle();
      if (tplErr) {
        throw createError({ statusCode: 500, statusMessage: tplErr.message });
      }
      if (!tpl) {
        throw createError({
          statusCode: 404,
          statusMessage: "Template not found for this asset",
        });
      }

      const { data: created, error: createErr } = await adminClient
        .from("rental_booking_checklists")
        .insert({
          booking_id: bookingId,
          asset_id: assetId,
          template_id: tpl.id,
          kind: tpl.kind,
          template_name: tpl.name,
          template_version: tpl.version,
          status: "draft",
          performed_by_user_id: userId,
        })
        .select("id")
        .single();
      if (createErr) {
        throw createError({ statusCode: 500, statusMessage: createErr.message });
      }
      checklistId = (created as { id: string }).id;

      const { data: tplItems, error: itemsErr } = await adminClient
        .from("asset_checklist_template_items")
        .select(
          "id, sort_order, label, instruction, response_type, is_required",
        )
        .eq("template_id", tpl.id)
        .order("sort_order", { ascending: true });
      if (itemsErr) {
        throw createError({ statusCode: 500, statusMessage: itemsErr.message });
      }

      if (Array.isArray(tplItems) && tplItems.length > 0) {
        const rows = tplItems.map((it: Record<string, unknown>) => ({
          booking_checklist_id: checklistId,
          template_item_id: it.id as string,
          sort_order: Number(it.sort_order ?? 0),
          label: it.label as string,
          instruction: (it.instruction as string) ?? null,
          response_type: it.response_type as string,
          is_required: Boolean(it.is_required),
        }));
        const { error: insertErr } = await adminClient
          .from("rental_booking_checklist_items")
          .insert(rows);
        if (insertErr) {
          throw createError({
            statusCode: 500,
            statusMessage: insertErr.message,
          });
        }
      }
    } else {
      const kind = body.kind;
      const name = (body.name ?? "").trim();
      if (!kind || !VALID_KINDS.includes(kind) || !name) {
        throw createError({
          statusCode: 400,
          statusMessage:
            "Either templateId, or both kind+name, must be supplied",
        });
      }
      const { data: created, error: createErr } = await adminClient
        .from("rental_booking_checklists")
        .insert({
          booking_id: bookingId,
          asset_id: assetId,
          kind,
          template_name: name,
          status: "draft",
          performed_by_user_id: userId,
        })
        .select("id")
        .single();
      if (createErr) {
        throw createError({ statusCode: 500, statusMessage: createErr.message });
      }
      checklistId = (created as { id: string }).id;
    }

    return await loadBookingOpsPayload(adminClient, bookingId, assetId);
  },
);
