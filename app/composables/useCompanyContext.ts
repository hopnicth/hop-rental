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

  // ── Fetch memberships from DB ──
  async function fetchMemberships(): Promise<void> {
    if (!user.value) {
      memberships.value = [];
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      // Query company_members + join companies in one call
      const { data, error: dbError } = await supabase
        .from("company_members")
        .select(
          `
          id, user_id, company_id, role, invited_by, joined_at,
          companies:company_id ( id, name, tax_id, credit_limit, credit_used, credit_term_days, billing_cycle, kyc_status, kyc_documents, billing_address, kyc_rejection_reason, created_at, updated_at )
        `,
        )
        .eq("user_id", user.value.id);

      if (dbError) {
        error.value = dbError.message;
        return;
      }

      memberships.value = (data ?? []).map((row: Record<string, unknown>) => ({
        member: {
          id: row.id,
          userId: row.user_id,
          companyId: row.company_id,
          role: row.role,
          invitedBy: row.invited_by,
          joinedAt: row.joined_at,
        } as CompanyMember,
        company: mapCompanyRow(row.companies as Record<string, unknown>),
      }));
    } catch (e) {
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
      taxId: (row.tax_id as string) ?? null,
      creditLimit: Number(row.credit_limit) || 0,
      creditUsed: Number(row.credit_used) || 0,
      creditTermDays: Number(row.credit_term_days) || 0,
      billingCycle: (row.billing_cycle as Company["billingCycle"]) ?? "cash",
      kycStatus: (row.kyc_status as Company["kycStatus"]) ?? "pending",
      kycDocuments: (row.kyc_documents as KycDocument[]) ?? null,
      billingAddress:
        (row.billing_address as Company["billingAddress"]) ?? null,
      kycRejectionReason: (row.kyc_rejection_reason as string) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  // ── Switch context ──

  /** Switch to B2C (personal) mode */
  function switchToPersonal(): void {
    activeContext.value = { ...DEFAULT_CONTEXT };
    saveContext(activeContext.value);
  }

  /** Switch to a specific company context */
  function switchToCompany(companyId: string): void {
    const m = memberships.value.find((ms) => ms.company.id === companyId);
    if (!m) return;

    activeContext.value = {
      companyId: m.company.id,
      role: m.member.role,
      companyName: m.company.name,
    };
    saveContext(activeContext.value);
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
  if (import.meta.client) {
    // Restore context from localStorage on first load
    activeContext.value = loadContext();

    watch(
      user,
      (newUser) => {
        if (newUser) {
          fetchMemberships().then(() => {
            // Validate stored context still exists in memberships
            if (activeContext.value.companyId) {
              const still = memberships.value.find(
                (m) => m.company.id === activeContext.value.companyId,
              );
              if (!still) {
                // Company removed or user kicked — fallback to B2C
                switchToPersonal();
              }
            }
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
    /** Check if user has role in any company */
    hasRoleInAnyCompany,
    /**
     * DEV ONLY — Override context with mock data.
     * Injects a fake company + membership so all computed properties react.
     * @param role — "b2c" | "b2b_user" | "b2b_admin"
     */
    __devOverrideContext: (role: "b2c" | "b2b_user" | "b2b_admin") => {
      if (!import.meta.dev) return;

      if (role === "b2c") {
        memberships.value = [];
        activeContext.value = { ...DEFAULT_CONTEXT };
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
