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
const currentAddressUserId = ref<string | null>(null);
const lastHydratedAddressUserId = ref<string | null | undefined>(undefined);

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
    houseNo: (row.house_no as string) ?? null,
    moo: (row.moo as string) ?? null,
    roomNo: (row.room_no as string) ?? null,
    building: (row.building as string) ?? null,
    street: (row.street as string) ?? null,
    fullAddress: (row.full_address as string) ?? "",
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
  if (fields.houseNo !== undefined) db.house_no = fields.houseNo;
  if (fields.moo !== undefined) db.moo = fields.moo;
  if (fields.roomNo !== undefined) db.room_no = fields.roomNo;
  if (fields.building !== undefined) db.building = fields.building;
  if (fields.street !== undefined) db.street = fields.street;
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

  async function resolveUserId(): Promise<string | null> {
    if (user.value?.id) return user.value.id;

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    return authUser?.id ?? null;
  }

  /** Fetch addresses — personal + company (filtered by RLS) */
  async function fetchAddresses(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const userId = await resolveUserId();
      if (!userId) {
        addresses.value = [];
        currentAddressUserId.value = null;
        lastHydratedAddressUserId.value = null;
        return;
      }

      if (currentAddressUserId.value !== userId) {
        addresses.value = [];
      }
      currentAddressUserId.value = userId;

      const { data, error: dbError } = await supabase
        .from("addresses")
        .select("*")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });

      if (dbError) {
        error.value = dbError.message;
        lastHydratedAddressUserId.value = undefined;
        return;
      }
      // `resolveUserId()` may get the authenticated user from Supabase before
      // `useSupabaseUser()` has hydrated. Do not drop valid address rows just
      // because the reactive user ref is still momentarily null.
      if (user.value?.id && user.value.id !== userId) {
        addresses.value = [];
        currentAddressUserId.value = user.value.id;
        lastHydratedAddressUserId.value = undefined;
        return;
      }
      addresses.value = (data ?? []).map((r: Record<string, unknown>) =>
        mapRow(r),
      );
      lastHydratedAddressUserId.value = userId;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Unknown error";
      lastHydratedAddressUserId.value = undefined;
    } finally {
      loading.value = false;
    }
  }

  /** Create a new address */
  async function createAddress(
    fields: Omit<Address, "id" | "createdAt" | "updatedAt">,
  ): Promise<Address | null> {
    error.value = null;

    const userId = await resolveUserId();
    const normalizedFields = {
      ...fields,
      userId:
        fields.userId ?? (fields.companyId == null ? (userId ?? null) : null),
    };

    const { data, error: dbError } = await supabase
      .from("addresses")
      .insert(toDbFields(normalizedFields))
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
    error.value = null;

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
    error.value = null;

    const { data, error: dbError } = await supabase
      .from("addresses")
      .delete()
      .select("id")
      .eq("id", id);

    if (dbError) {
      error.value = dbError.message;
      return false;
    }

    if (!Array.isArray(data) || data.length === 0) {
      error.value =
        "Address could not be deleted. It may no longer exist or you may not have permission.";
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

  if (import.meta.client) {
    watch(
      () => user.value?.id ?? null,
      (newId, oldId) => {
        if (newId === oldId) return;
        addresses.value = [];
        error.value = null;
        currentAddressUserId.value = newId;
        lastHydratedAddressUserId.value = undefined;
        loading.value = false;
        if (newId) void fetchAddresses();
      },
    );
  }

  return {
    /** All addresses visible to the user (RLS-filtered) */
    addresses: computed(() => addresses.value),
    /** Personal addresses only */
    personalAddresses,
    /** Company addresses only */
    companyAddresses,
    /** Loading state */
    loading: computed(() => loading.value),
    /** Current authenticated user represented by the address cache */
    currentUserId: computed(() => currentAddressUserId.value),
    isHydratedForCurrentUser: computed(() => {
      const reactiveUserId = user.value?.id ?? null;
      return (
        !loading.value &&
        currentAddressUserId.value === reactiveUserId &&
        lastHydratedAddressUserId.value === reactiveUserId
      );
    }),
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
