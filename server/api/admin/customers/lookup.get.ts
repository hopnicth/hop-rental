import { createError, defineEventHandler, getQuery } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_RENTAL_BOOKING_LIST_SELECT,
  fetchAdminUserProfiles,
  isUuid,
  mapAdminRentalBookingRow,
} from "~~/server/utils/admin-orders";
import type { AdminRentalBookingRow } from "~~/app/types/admin-order";
import type { AdminCustomerProfile } from "~~/app/types/admin-order-detail";

interface WalkInCustomerRow {
  phone: string;
  full_name: string | null;
  linked_user_id: string | null;
  id_card_url: string | null;
  notes: string | null;
  updated_at: string;
}

export interface AdminCustomerLookupResponse {
  customer: (AdminCustomerProfile & { kind: "account" | "walk_in" }) | null;
  walkIn: WalkInCustomerRow | null;
  bookings: AdminRentalBookingRow[];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeLike(value: string): string {
  return `*${value.replace(/[%_*]/g, "")}*`;
}

export default defineEventHandler(
  async (event): Promise<AdminCustomerLookupResponse> => {
    const { adminClient } = await requirePlatformAdmin(event);
    const q = getQuery(event);
    const userId = asString(q.userId);
    const phone = asString(q.phone || q.search);
    const search = userId || phone;
    if (!search) {
      throw createError({
        statusCode: 400,
        statusMessage: "Search is required",
      });
    }

    const profileIds = new Set<string>();
    if (userId && isUuid(userId)) profileIds.add(userId);

    if (phone) {
      const { data, error } = await adminClient
        .from("users")
        .select("id")
        .or(`phone.ilike.${safeLike(phone)},full_name.ilike.${safeLike(phone)}`)
        .limit(10);
      if (error)
        throw createError({ statusCode: 500, statusMessage: error.message });
      for (const row of (data ?? []) as Array<{ id?: string }>) {
        if (row.id) profileIds.add(row.id);
      }
    }

    const profiles = await fetchAdminUserProfiles(
      adminClient,
      Array.from(profileIds),
    );
    const firstProfileId = Array.from(profileIds)[0] ?? null;
    const firstProfile = firstProfileId ? profiles.get(firstProfileId) : null;

    let walkIn: WalkInCustomerRow | null = null;
    if (phone || firstProfileId) {
      let walkInQuery = adminClient
        .from("walk_in_customers")
        .select(
          "phone, full_name, linked_user_id, id_card_url, notes, updated_at",
        )
        .limit(1);
      walkInQuery = phone
        ? walkInQuery.eq("phone", phone)
        : walkInQuery.eq("linked_user_id", firstProfileId);
      const { data, error } = await walkInQuery.maybeSingle();
      if (!error) walkIn = (data as WalkInCustomerRow | null) ?? null;
    }

    const bookingMap = new Map<string, AdminRentalBookingRow>();
    for (const id of profileIds) {
      const { data, error } = await adminClient
        .from("rental_bookings")
        .select(ADMIN_RENTAL_BOOKING_LIST_SELECT)
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error)
        throw createError({ statusCode: 500, statusMessage: error.message });
      for (const row of data ?? [])
        bookingMap.set(String(row.id), mapAdminRentalBookingRow(row));
    }
    if (phone) {
      const { data, error } = await adminClient
        .from("rental_bookings")
        .select(ADMIN_RENTAL_BOOKING_LIST_SELECT)
        .ilike("booker_phone", `%${phone.replace(/[%_]/g, "")}%`)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error)
        throw createError({ statusCode: 500, statusMessage: error.message });
      for (const row of data ?? [])
        bookingMap.set(String(row.id), mapAdminRentalBookingRow(row));
    }

    const customer = firstProfileId
      ? {
          kind: "account" as const,
          userId: firstProfileId,
          fullName: firstProfile?.fullName ?? null,
          phone: firstProfile?.phone ?? null,
          kycStatus: firstProfile?.kycStatus ?? null,
          idCardUrl: firstProfile?.idCardUrl ?? walkIn?.id_card_url ?? null,
        }
      : walkIn
        ? {
            kind: "walk_in" as const,
            userId: walkIn.linked_user_id ?? "",
            fullName: walkIn.full_name,
            phone: walkIn.phone,
            kycStatus: null,
            idCardUrl: walkIn.id_card_url,
          }
        : null;

    return {
      customer,
      walkIn,
      bookings: Array.from(bookingMap.values()).sort((a, b) =>
        a.createdAt < b.createdAt ? 1 : -1,
      ),
    };
  },
);
