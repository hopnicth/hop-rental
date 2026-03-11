/**
 * Composable for CRUD operations on `public.addresses`.
 *
 * Supports both personal (user_id) and company (company_id) addresses.
 * SSR-safe — DB queries only run on client.
 */
import type { Address } from "~/types/user";

// ── Singleton reactive state ─────────────────────────────
const addresses = ref<Address[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

/** Map snake_case DB row → camelCase Address */
function mapRow(row: Record<string, unknown>): Address {
  return {
    id: row.id as string,
    userId: (row.user_id as string) ?? null,
    companyId: (row.company_id as string) ?? null,
    title: row.title as string,
    contactName: (row.contact_name as string) ?? null,
    contactPhone: (row.contact_phone as string) ?? null,
    isDefault: (row.is_default as boolean) ?? false,
    fullAddress: row.full_address as string,
    subDistrict: (row.sub_district as string) ?? null,
    district: (row.district as string) ?? null,
    province: (row.province as string) ?? null,
    postalCode: (row.postal_code as string) ?? null,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    note: (row.note as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** Map camelCase Address fields → snake_case for DB insert/update */
function toDbFields(
  fields: Partial<Omit<Address, "id" | "createdAt" | "updatedAt">>,
): Record<string, unknown> {
  const db: Record<string, unknown> = {};
  if (fields.userId !== undefined) db.user_id = fields.userId;
  if (fields.companyId !== undefined) db.company_id = fields.companyId;
  if (fields.title !== undefined) db.title = fields.title;
  if (fields.contactName !== undefined) db.contact_name = fields.contactName;
  if (fields.contactPhone !== undefined) db.contact_phone = fields.contactPhone;
  if (fields.isDefault !== undefined) db.is_default = fields.isDefault;
  if (fields.fullAddress !== undefined) db.full_address = fields.fullAddress;
  if (fields.subDistrict !== undefined) db.sub_district = fields.subDistrict;
  if (fields.district !== undefined) db.district = fields.district;
  if (fields.province !== undefined) db.province = fields.province;
  if (fields.postalCode !== undefined) db.postal_code = fields.postalCode;
  if (fields.latitude !== undefined) db.latitude = fields.latitude;
  if (fields.longitude !== undefined) db.longitude = fields.longitude;
  if (fields.note !== undefined) db.note = fields.note;
  return db;
}

export function useAddresses() {
  const supabase = useSupabaseClient();
  const user = useSupabaseUser();

  /** Fetch addresses — personal + company (filtered by RLS) */
  async function fetchAddresses(): Promise<void> {
    if (!user.value) {
      addresses.value = [];
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      const { data, error: dbError } = await supabase
        .from("addresses")
        .select("*")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });

      if (dbError) {
        error.value = dbError.message;
        return;
      }
      addresses.value = (data ?? []).map((r: Record<string, unknown>) =>
        mapRow(r),
      );
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Unknown error";
    } finally {
      loading.value = false;
    }
  }

  /** Create a new address */
  async function createAddress(
    fields: Omit<Address, "id" | "createdAt" | "updatedAt">,
  ): Promise<Address | null> {
    const { data, error: dbError } = await supabase
      .from("addresses")
      .insert(toDbFields(fields))
      .select()
      .single();

    if (dbError) {
      error.value = dbError.message;
      return null;
    }
    await fetchAddresses();
    return data ? mapRow(data as Record<string, unknown>) : null;
  }

  /** Update an existing address */
  async function updateAddress(
    id: string,
    fields: Partial<Omit<Address, "id" | "createdAt" | "updatedAt">>,
  ): Promise<boolean> {
    const { error: dbError } = await supabase
      .from("addresses")
      .update(toDbFields(fields))
      .eq("id", id);

    if (dbError) {
      error.value = dbError.message;
      return false;
    }
    await fetchAddresses();
    return true;
  }

  /** Delete an address */
  async function deleteAddress(id: string): Promise<boolean> {
    const { error: dbError } = await supabase
      .from("addresses")
      .delete()
      .eq("id", id);

    if (dbError) {
      error.value = dbError.message;
      return false;
    }
    await fetchAddresses();
    return true;
  }

  /** Computed: personal addresses only */
  const personalAddresses = computed(() =>
    addresses.value.filter((a) => a.userId !== null),
  );

  /** Computed: company addresses only */
  const companyAddresses = computed(() =>
    addresses.value.filter((a) => a.companyId !== null),
  );

  return {
    /** All addresses visible to the user (RLS-filtered) */
    addresses: computed(() => addresses.value),
    /** Personal addresses only */
    personalAddresses,
    /** Company addresses only */
    companyAddresses,
    /** Loading state */
    loading: computed(() => loading.value),
    /** Error message */
    error: computed(() => error.value),
    /** Fetch all addresses */
    fetchAddresses,
    /** Create a new address */
    createAddress,
    /** Update an existing address */
    updateAddress,
    /** Delete an address */
    deleteAddress,
  };
}
