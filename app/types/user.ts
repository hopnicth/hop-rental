/**
 * User Management & RBAC types.
 *
 * Maps to database tables: users, companies, company_members
 * Created by SQL migration: supabase/migrations/001_rbac_schema.sql
 */

// ─── Enum-like Union Types (match DB enums) ─────────────────

/**
 * Platform-level role — stored in `users.platform_role`.
 * `staff` and `super_admin` are internal HOPNIC roles.
 */
export type PlatformRole = "customer" | "staff" | "super_admin";

/** Membership tier — stored in `users.membership_level` */
export type MembershipLevel = "bronze" | "silver" | "gold";

/** KYC verification status — stored in `companies.kyc_status` */
export type KycStatus = "pending" | "verified" | "rejected";

/** Billing cycle — stored in `companies.billing_cycle` */
export type BillingCycle = "cash" | "EOM" | "15th" | "25th" | "upon_delivery";

/** Role within a customer organization — stored in `company_members.role` */
export type CompanyRole = "b2b_admin" | "b2b_user";

/** Customer tax profile owner kind — stored in `customer_tax_profiles.customer_kind` */
export type CustomerTaxProfileCustomerKind = "person" | "company";

/** Branch classification — stored in `customer_tax_profiles.branch_type` */
export type CustomerTaxProfileBranchType = "none" | "head_office" | "branch";

/** Review workflow status — stored in `customer_tax_profiles.review_status` */
export type CustomerTaxProfileReviewStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected";

// ─── Table Interfaces ───────────────────────────────────────

/**
 * User profile — 1:1 with `auth.users`.
 *
 * Auto-created on signup via DB trigger.
 * Everyone starts as a personal customer account (`platform_role = 'customer'`).
 */
export interface UserProfile {
  /** UUID — same as auth.users.id */
  id: string;
  /** Display name */
  fullName: string | null;
  /** Phone number */
  phone: string | null;
  /** Avatar image URL (from Google OAuth or uploaded) */
  avatarUrl: string | null;
  /** Platform-level role */
  platformRole: PlatformRole;
  /** Loyalty tier */
  membershipLevel: MembershipLevel;
  /** B2C KYC verification status */
  kycStatus: KycStatus;
  /** Private Storage path for uploaded ID card, or legacy URL if present */
  idCardUrl: string | null;
  /** URL of PDPA terms document the user agreed to */
  pdpaConsentUrl: string | null;
  /** Timestamp when user gave PDPA consent */
  pdpaConsentedAt: string | null;
  /** Reason for KYC rejection (set by admin) */
  kycRejectionReason: string | null;
  /** Non-destructive lifecycle state for account deletion/deactivation flows */
  accountStatus:
    | "active"
    | "deactivated"
    | "deletion_requested"
    | "anonymized"
    | "deleted";
  /** Timestamp when temporary account deactivation was requested */
  deactivationRequestedAt: string | null;
  /** Timestamp when account deletion was requested */
  deletionRequestedAt: string | null;
  /** Timestamp when account was soft-deleted */
  deletedAt: string | null;
  /** Timestamp when account PII was anonymized */
  anonymizedAt: string | null;
  /** Timestamp of latest lifecycle transition */
  lifecycleUpdatedAt: string | null;
  /** ISO date string */
  createdAt: string;
  /** ISO date string */
  updatedAt: string;
}

/**
 * Company / Legal entity.
 *
 * Holds credit limits, KYC status, and billing info.
 */
export interface Company {
  /** UUID */
  id: string;
  /** Company name */
  name: string;
  /** Tax ID (เลขผู้เสียภาษี) — unique */
  taxId: string | null;
  /** Total credit limit (THB) */
  creditLimit: number;
  /** Credit currently used (THB) */
  creditUsed: number;
  /** Payment term in days: 0 = cash, 30, 45, 60 */
  creditTermDays: number;
  /** Billing cycle: cash, EOM, 15th, 25th, upon_delivery */
  billingCycle: BillingCycle;
  /** KYC verification status */
  kycStatus: KycStatus;
  /** KYC documents: ภพ.20, หนังสือรับรองบริษัท etc. */
  kycDocuments: KycDocument[] | null;
  /** Billing address (structured JSON) */
  billingAddress: BillingAddress | null;
  /** Reason for company KYC rejection (set by admin) */
  kycRejectionReason: string | null;
  /** ISO date string */
  createdAt: string;
  /** ISO date string */
  updatedAt: string;
}

/**
 * KYC document stored as JSONB array in `companies.kyc_documents`.
 * e.g. ภพ.20, หนังสือรับรองบริษัท
 */
export interface KycDocument {
  /** Document name / label */
  name: string;
  /** Legacy public URL or private path from older records; new uploads omit this. */
  url?: string;
  /** MIME type for server-side private uploads. */
  mimeType?: string;
  /** File size in bytes for server-side private uploads. */
  fileSize?: number;
  /** ISO date string — when the document was uploaded */
  uploadedAt: string;
}

/**
 * Billing address structure stored as JSONB in `companies.billing_address`.
 */
export interface BillingAddress {
  /** Address line 1 */
  line1: string;
  /** Address line 2 (optional) */
  line2?: string;
  /** Sub-district (ตำบล/แขวง) */
  subDistrict: string;
  /** District (อำเภอ/เขต) */
  district: string;
  /** Province (จังหวัด) */
  province: string;
  /** Postal code */
  postalCode: string;
  /** Country code — default 'TH' */
  country: string;
}

/**
 * Junction: user ↔ company with role.
 *
 * A user can belong to multiple companies.
 * Each membership has a customer-organization role (b2b_admin or b2b_user).
 */
export interface CompanyMember {
  /** UUID */
  id: string;
  /** User ID — FK → users.id */
  userId: string;
  /** Company ID — FK → companies.id */
  companyId: string;
  /** Role within this company */
  role: CompanyRole;
  /** Who invited this user — FK → users.id (nullable) */
  invitedBy: string | null;
  /** ISO date string */
  joinedAt: string;
}

/**
 * Default personal tax invoice profile for the current authenticated user.
 * Maps to `public.customer_tax_profiles` when `customer_user_id` is set.
 */
export interface CustomerTaxProfile {
  id: string;
  customerKind: CustomerTaxProfileCustomerKind;
  legalName: string;
  taxId: string;
  taxIdNormalized: string;
  branchType: CustomerTaxProfileBranchType;
  branchCode: string;
  billingAddress: string;
  phone: string;
  email: string;
  reviewStatus: CustomerTaxProfileReviewStatus;
  reviewedAt: string | null;
  rejectionReason: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Client-editable fields for the current user's default tax profile. */
export interface CustomerTaxProfileInput {
  customerKind: CustomerTaxProfileCustomerKind;
  legalName: string;
  taxId: string;
  branchType: CustomerTaxProfileBranchType;
  branchCode: string;
  billingAddress: string;
  phone: string;
  email: string;
}

// ─── Active Context ─────────────────────────────────────────

/**
 * Represents the user's current operating context.
 *
 * - `null` companyId → personal customer mode
 * - non-null companyId → organization/company context
 *
 * Persisted in localStorage so it survives page refresh.
 */
export interface ActiveContext {
  /** Company ID — null means personal customer mode */
  companyId: string | null;
  /** Role in the active company — null in personal mode */
  role: CompanyRole | null;
  /** Company name for display — null in personal mode */
  companyName: string | null;
}

// ─── Address ────────────────────────────────────────────────

/**
 * Delivery address — polymorphic owner (user OR company).
 * Maps to `public.addresses` table.
 */
export interface Address {
  /** UUID */
  id: string;
  /** Owner: user ID (personal address) */
  userId: string | null;
  /** Owner: company ID (company address) */
  companyId: string | null;
  /** Label: สำนักงานใหญ่, หน้างานระยอง, บ้านพัก */
  title: string;
  /** Contact person name */
  contactName: string | null;
  /** Contact phone number */
  contactPhone: string | null;
  /** Whether this is the default address for the owner */
  isDefault: boolean;
  /** Full address text */
  fullAddress: string;
  /** Sub-district (ตำบล/แขวง) */
  subDistrict: string | null;
  /** District (อำเภอ/เขต) */
  district: string | null;
  /** Province (จังหวัด) */
  province: string | null;
  /** Postal code */
  postalCode: string | null;
  /** GPS latitude */
  latitude: number | null;
  /** GPS longitude */
  longitude: number | null;
  /** Additional note */
  note: string | null;
  /** ISO date string */
  createdAt: string;
  /** ISO date string */
  updatedAt: string;
}

// ─── Enriched types (joins) ─────────────────────────────────

/**
 * Company membership enriched with company details.
 * Used by company switcher UI.
 */
export interface CompanyMembership {
  /** The membership record */
  member: CompanyMember;
  /** The company info */
  company: Company;
}
