import { createError } from "h3";

export const ADMIN_STORE_BRANCH_SELECT =
  "id, code, name_th, name_en, address_th, address_en, phone, email, latitude, longitude, notes, is_active, sort_order, created_at, updated_at";

function asBranchRow(row: unknown) {
  return row && typeof row === "object" ? (row as Record<string, unknown>) : {};
}

export function mapAdminStoreBranchItem(row: unknown) {
  const item = asBranchRow(row);
  return {
    id: String(item.id ?? ""),
    code: String(item.code ?? ""),
    nameTh: String(item.name_th ?? ""),
    nameEn: String(item.name_en ?? ""),
    addressTh: String(item.address_th ?? ""),
    addressEn: String(item.address_en ?? ""),
    phone: String(item.phone ?? ""),
    email: String(item.email ?? ""),
    latitude: typeof item.latitude === "number" ? item.latitude : null,
    longitude: typeof item.longitude === "number" ? item.longitude : null,
    notes: String(item.notes ?? ""),
    isActive: item.is_active !== false,
    sortOrder: Number(item.sort_order ?? 0),
    createdAt:
      typeof item.created_at === "string" ? item.created_at : undefined,
    updatedAt:
      typeof item.updated_at === "string" ? item.updated_at : undefined,
  };
}

export function buildBranchPayload(body: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};

  if (typeof body.code === "string") payload.code = body.code.trim();
  if (typeof body.nameTh === "string") payload.name_th = body.nameTh.trim();
  if (typeof body.nameEn === "string") payload.name_en = body.nameEn.trim();
  if (typeof body.addressTh === "string")
    payload.address_th = body.addressTh.trim();
  if (typeof body.addressEn === "string")
    payload.address_en = body.addressEn.trim();
  if (typeof body.phone === "string") payload.phone = body.phone.trim();
  if (typeof body.email === "string") payload.email = body.email.trim();
  if (typeof body.latitude === "number") payload.latitude = body.latitude;
  if (typeof body.longitude === "number") payload.longitude = body.longitude;
  if (typeof body.notes === "string") payload.notes = body.notes.trim();
  if (typeof body.isActive === "boolean") payload.is_active = body.isActive;
  if (typeof body.sortOrder === "number") payload.sort_order = body.sortOrder;

  return payload;
}

export async function resolveActiveStoreBranch(
  adminClient: {
    from(table: "store_branches"): {
      select(columns: string): {
        eq(
          column: string,
          value: unknown,
        ): {
          eq(
            column: string,
            value: unknown,
          ): {
            single(): Promise<{
              data: unknown;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  },
  branchId: string,
) {
  const { data, error } = await adminClient
    .from("store_branches")
    .select(ADMIN_STORE_BRANCH_SELECT)
    .eq("id", branchId)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    throw createError({
      statusCode: 422,
      statusMessage: "branchId must reference an active branch",
    });
  }

  const item = mapAdminStoreBranchItem(data);

  return {
    branchId: item.id,
    branchCode: item.code,
    branchName: item.nameTh || item.nameEn,
  };
}
