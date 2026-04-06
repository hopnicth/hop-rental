/**
 * Composable for managing active context (B2C ↔ B2B switching).
 *
 * - Fetches company memberships for the current user
 * - Provides company switcher data
 * - Persists active context in localStorage
 * - Role-checking helpers (isB2BAdmin, isB2BUser, isB2C)
 *
 * SSR-safe — DB queries and localStorage only run on client.
 */
import type {
  ActiveContext,
  Company,
  CompanyMember,
  CompanyMembership,
  CompanyRole,
  KycDocument,
} from "~/types/user";

// ── Constants ───────────────────────────────────────────────
const CONTEXT_STORAGE_KEY = "hop-rental-active-context";
const DEFAULT_CONTEXT: ActiveContext = {
  companyId: null,
  role: null,
  companyName: null,
};

// ── Singleton reactive state ────────────────────────────────
const activeContext = ref<ActiveContext>({ ...DEFAULT_CONTEXT });
const memberships = ref<CompanyMembership[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
let isCompanyContextInitialized = false;

// ── LocalStorage helpers ────────────────────────────────────

function loadContext(): ActiveContext {
  if (import.meta.server) return { ...DEFAULT_CONTEXT };
  try {
    const raw = localStorage.getItem(CONTEXT_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ActiveContext;
  } catch {
    // corrupted — reset
  }
  return { ...DEFAULT_CONTEXT };
}

function saveContext(ctx: ActiveContext): void {
  if (import.meta.server) return;
  try {
    localStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(ctx));
  } catch {
    // storage unavailable
  }
}

export function useCompanyContext() {
  const supabase = useSupabaseClient();
  const user = useSupabaseUser();
  const companySelectColumns =
    "id, name, tax_id, credit_limit, credit_used, credit_term_days, billing_cycle, kyc_status, kyc_documents, billing_address, kyc_rejection_reason, created_at, updated_at";

  async function resolveUserId(): Promise<string | null> {
    if (typeof user.value?.id === "string" && user.value.id.length > 0) {
      return user.value.id;
    }

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    return authUser?.id ?? null;
  }

  function getRowValue<T>(
    row: Record<string, unknown>,
    snakeKey: string,
    camelKey: string,
  ): T | undefined {
    return (row[snakeKey] ?? row[camelKey]) as T | undefined;
  }

  function isUuid(value: unknown): value is string {
    return (
      typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    );
  }

  function mapMemberRow(row: Record<string, unknown>): CompanyMember | null {
    const companyId = getRowValue<string>(row, "company_id", "companyId");
    const userId = getRowValue<string>(row, "user_id", "userId");
    const joinedAt = getRowValue<string>(row, "joined_at", "joinedAt");

    if (!isUuid(companyId) || !isUuid(userId) || typeof joinedAt !== "string") {
      return null;
    }

    return {
      id: row.id as string,
      userId,
      companyId,
      role: row.role as CompanyRole,
      invitedBy:
        getRowValue<string | null>(row, "invited_by", "invitedBy") ?? null,
      joinedAt,
    };
  }

  // ── Fetch memberships from DB ──
  async function fetchMemberships(): Promise<void> {
    const userId = await resolveUserId();
    if (!userId) {
      memberships.value = [];
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      const { data: memberRows, error: memberError } = await supabase
        .from("company_members")
        .select("id, user_id, company_id, role, invited_by, joined_at")
        .eq("user_id", userId);

      if (memberError) {
        memberships.value = [];
        error.value = memberError.message;
        return;
      }

      const rawMemberRows = (memberRows ?? []) as Record<string, unknown>[];
      if (rawMemberRows.length === 0) {
        memberships.value = [];
        return;
      }

      const memberList = rawMemberRows
        .map(mapMemberRow)
        .filter((member): member is CompanyMember => member !== null);

      if (memberList.length === 0) {
        memberships.value = [];
        error.value =
          "Company membership records were found, but no valid company IDs were returned.";
        return;
      }

      const companyIds = [
        ...new Set(memberList.map((member) => member.companyId)),
      ];
      const { data: companyRows, error: companyError } = await supabase
        .from("companies")
        .select(companySelectColumns)
        .in("id", companyIds);

      if (companyError) {
        memberships.value = [];
        error.value = companyError.message;
        return;
      }

      const companiesById = new Map(
        ((companyRows ?? []) as Record<string, unknown>[]).map((row) => [
          row.id as string,
          mapCompanyRow(row),
        ]),
      );

      memberships.value = memberList.flatMap((member) => {
        const companyId = member.companyId;
        const company = companiesById.get(companyId);

        if (!company) {
          return [];
        }

        return [
          {
            member,
            company,
          },
        ];
      });

      if (memberships.value.length === 0) {
        error.value =
          "Company membership records were found, but company details could not be loaded.";
      }
    } catch (e) {
      memberships.value = [];
      error.value = e instanceof Error ? e.message : "Unknown error";
    } finally {
      loading.value = false;
    }
  }

  /** Map snake_case company row to camelCase */
  function mapCompanyRow(row: Record<string, unknown>): Company {
    return {
      id: row.id as string,
      name: row.name as string,
      taxId: getRowValue<string | null>(row, "tax_id", "taxId") ?? null,
      creditLimit: Number(getRowValue(row, "credit_limit", "creditLimit")) || 0,
      creditUsed: Number(getRowValue(row, "credit_used", "creditUsed")) || 0,
      creditTermDays:
        Number(getRowValue(row, "credit_term_days", "creditTermDays")) || 0,
      billingCycle:
        (getRowValue(
          row,
          "billing_cycle",
          "billingCycle",
        ) as Company["billingCycle"]) ?? "cash",
      kycStatus:
        (getRowValue(row, "kyc_status", "kycStatus") as Company["kycStatus"]) ??
        "pending",
      kycDocuments:
        (getRowValue(row, "kyc_documents", "kycDocuments") as KycDocument[]) ??
        null,
      billingAddress:
        (getRowValue(
          row,
          "billing_address",
          "billingAddress",
        ) as Company["billingAddress"]) ?? null,
      kycRejectionReason:
        getRowValue<string | null>(
          row,
          "kyc_rejection_reason",
          "kycRejectionReason",
        ) ?? null,
      createdAt:
        getRowValue<string>(row, "created_at", "createdAt") ??
        new Date().toISOString(),
      updatedAt:
        getRowValue<string>(row, "updated_at", "updatedAt") ??
        new Date().toISOString(),
    };
  }

  // ── Switch context ──

  /** Switch to B2C (personal) mode */
  function switchToPersonal(): void {
    activeContext.value = { ...DEFAULT_CONTEXT };
    saveContext(activeContext.value);
  }

  function setActiveContext(membership: CompanyMembership): void {
    activeContext.value = {
      companyId: membership.company.id,
      role: membership.member.role,
      companyName: membership.company.name,
    };
    saveContext(activeContext.value);
  }

  /** Switch to a specific company context */
  function switchToCompany(companyId: string): void {
    const m = memberships.value.find((ms) => ms.company.id === companyId);
    if (!m) return;

    setActiveContext(m);
  }

  function syncContextWithMemberships(): void {
    if (memberships.value.length === 0) {
      switchToPersonal();
      return;
    }

    const activeMembership = activeContext.value.companyId
      ? memberships.value.find(
          (membership) =>
            membership.company.id === activeContext.value.companyId,
        )
      : null;

    if (activeMembership) {
      setActiveContext(activeMembership);
      return;
    }

    setActiveContext(memberships.value[0]!);
  }

  // ── Computed helpers ──
  const isB2C = computed(() => activeContext.value.companyId === null);
  const isB2B = computed(() => activeContext.value.companyId !== null);
  const isB2BAdmin = computed(() => activeContext.value.role === "b2b_admin");
  const isB2BUser = computed(() => activeContext.value.role === "b2b_user");

  const currentCompany = computed<Company | null>(() => {
    if (!activeContext.value.companyId) return null;
    const m = memberships.value.find(
      (ms) => ms.company.id === activeContext.value.companyId,
    );
    return m?.company ?? null;
  });

  const creditRemaining = computed(() => {
    const c = currentCompany.value;
    if (!c) return 0;
    return Math.max(0, c.creditLimit - c.creditUsed);
  });

  /** Check if user has a specific role in ANY company */
  function hasRoleInAnyCompany(role: CompanyRole): boolean {
    return memberships.value.some((m) => m.member.role === role);
  }

  // ── Auto-fetch + restore context on auth change (client-only) ──
  if (import.meta.client && !isCompanyContextInitialized) {
    isCompanyContextInitialized = true;

    // Restore context from localStorage only once per app boot.
    activeContext.value = loadContext();

    watch(
      () => user.value?.id ?? null,
      (userId) => {
        if (userId) {
          void fetchMemberships().then(() => {
            syncContextWithMemberships();
          });
        } else {
          memberships.value = [];
          switchToPersonal();
        }
      },
      { immediate: true },
    );
  }

  return {
    /** Current active context (B2C or B2B) */
    activeContext: computed(() => activeContext.value),
    /** All company memberships for the current user */
    memberships: computed(() => memberships.value),
    /** Currently active company (null in B2C mode) */
    currentCompany,
    /** Remaining credit for active company */
    creditRemaining,
    /** Whether currently in B2C (personal) mode */
    isB2C,
    /** Whether currently in B2B (company) mode */
    isB2B,
    /** Whether current role is b2b_admin */
    isB2BAdmin,
    /** Whether current role is b2b_user */
    isB2BUser,
    /** Loading state */
    loading: computed(() => loading.value),
    /** Error message */
    error: computed(() => error.value),
    /** Switch to personal (B2C) mode */
    switchToPersonal,
    /** Switch to a company context by ID */
    switchToCompany,
    /** Re-fetch memberships from database */
    fetchMemberships,
    /** Align current active context with fetched memberships */
    syncContextWithMemberships,
    /** Check if user has role in any company */
    hasRoleInAnyCompany,
    /**
     * DEV ONLY — Override context with mock data.
     * Prefers real memberships when available, otherwise injects mock data.
     * @param role — "b2c" | "b2b_user" | "b2b_admin"
     */
    __devOverrideContext: async (role: "b2c" | "b2b_user" | "b2b_admin") => {
      if (!import.meta.dev) return;

      await fetchMemberships();

      if (role === "b2c") {
        if (memberships.value.length > 0) {
          switchToPersonal();
          return;
        }

        memberships.value = [];
        activeContext.value = { ...DEFAULT_CONTEXT };
        saveContext(activeContext.value);
        return;
      }

      const realMembership = memberships.value.find(
        (m) => m.member.role === role,
      );
      if (realMembership) {
        activeContext.value = {
          companyId: realMembership.company.id,
          role: realMembership.member.role,
          companyName: realMembership.company.name,
        };
        saveContext(activeContext.value);
        return;
      }

      // Mock company data for B2B modes
      const mockCompany: Company = {
        id: "dev-company-001",
        name: "บริษัท ทดสอบ จำกัด (Dev)",
        taxId: "0123456789012",
        creditLimit: 500000,
        creditUsed: 150000,
        creditTermDays: 30,
        billingCycle: "EOM",
        kycStatus: "verified",
        kycDocuments: [
          {
            name: "vat",
            url: "/mock/vat.pdf",
            uploadedAt: "2024-01-01T00:00:00Z",
          },
          {
            name: "certificate",
            url: "/mock/cert.pdf",
            uploadedAt: "2024-01-15T00:00:00Z",
          },
        ],
        billingAddress: {
          line1: "123 ถนนทดสอบ",
          subDistrict: "แขวงทดสอบ",
          district: "เขตทดสอบ",
          province: "กรุงเทพมหานคร",
          postalCode: "10100",
          country: "TH",
        },
        kycRejectionReason: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-06-01T00:00:00Z",
      };

      const mockMember: CompanyMember = {
        id: "dev-member-001",
        userId: "dev-user-001",
        companyId: mockCompany.id,
        role: role as CompanyRole,
        invitedBy: null,
        joinedAt: "2024-02-01T00:00:00Z",
      };

      memberships.value = [{ member: mockMember, company: mockCompany }];
      activeContext.value = {
        companyId: mockCompany.id,
        role: role as CompanyRole,
        companyName: mockCompany.name,
      };
      saveContext(activeContext.value);
    },
  };
}
