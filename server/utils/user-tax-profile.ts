import { createError } from "h3";
import type {
  CustomerTaxProfile,
  CustomerTaxProfileBranchType,
  CustomerTaxProfileCustomerKind,
  CustomerTaxProfileInput,
  CustomerTaxProfileReviewStatus,
} from "~/types/user";

const CUSTOMER_KIND_VALUES = ["person", "company"] as const;
const BRANCH_TYPE_VALUES = ["none", "head_office", "branch"] as const;

export const USER_TAX_PROFILE_SELECT =
  "id, customer_kind, legal_name, tax_id, tax_id_normalized, branch_type, branch_code, billing_address, phone, email, review_status, reviewed_at, rejection_reason, is_default, created_at, updated_at";

function requireEnum<T extends readonly string[]>(
  field: string,
  value: unknown,
  allowed: T,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw createError({
      statusCode: 422,
      statusMessage: `${field} is invalid`,
    });
  }
  return value as T[number];
}

function requireText(field: string, value: unknown): string {
  if (typeof value !== "string") {
    throw createError({
      statusCode: 422,
      statusMessage: `${field} is required`,
    });
  }

  const normalized = value.trim();
  if (!normalized) {
    throw createError({
      statusCode: 422,
      statusMessage: `${field} is required`,
    });
  }

  return normalized;
}

function optionalText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function normalizeTaxId(value: string): string {
  return value.replace(/[^0-9A-Za-z]/g, "").trim();
}

export function requireCustomerTaxProfileInput(
  body: Record<string, unknown>,
): CustomerTaxProfileInput & { taxIdNormalized: string } {
  const customerKind = requireEnum(
    "customerKind",
    body.customerKind,
    CUSTOMER_KIND_VALUES,
  ) as CustomerTaxProfileCustomerKind;
  const legalName = requireText("legalName", body.legalName);
  const taxId = requireText("taxId", body.taxId);
  const taxIdNormalized = normalizeTaxId(taxId);
  if (!taxIdNormalized) {
    throw createError({ statusCode: 422, statusMessage: "taxId is invalid" });
  }

  const branchType =
    customerKind === "person"
      ? "none"
      : (requireEnum(
          "branchType",
          body.branchType,
          BRANCH_TYPE_VALUES,
        ) as CustomerTaxProfileBranchType);
  const branchCode =
    branchType === "branch" ? requireText("branchCode", body.branchCode) : "";

  const billingAddress = requireText("billingAddress", body.billingAddress);
  const phone = optionalText(body.phone);
  const email = optionalText(body.email);

  return {
    customerKind,
    legalName,
    taxId,
    taxIdNormalized,
    branchType,
    branchCode,
    billingAddress,
    phone,
    email,
  };
}

export function mapCustomerTaxProfile(
  row: Record<string, unknown> | null | undefined,
): CustomerTaxProfile | null {
  if (!row) return null;

  return {
    id: String(row.id ?? ""),
    customerKind:
      (row.customer_kind as CustomerTaxProfileCustomerKind) ?? "person",
    legalName: String(row.legal_name ?? ""),
    taxId: String(row.tax_id ?? ""),
    taxIdNormalized: String(row.tax_id_normalized ?? ""),
    branchType: (row.branch_type as CustomerTaxProfileBranchType) ?? "none",
    branchCode: String(row.branch_code ?? ""),
    billingAddress: String(row.billing_address ?? ""),
    phone: String(row.phone ?? ""),
    email: String(row.email ?? ""),
    reviewStatus:
      (row.review_status as CustomerTaxProfileReviewStatus) ?? "draft",
    reviewedAt: typeof row.reviewed_at === "string" ? row.reviewed_at : null,
    rejectionReason: String(row.rejection_reason ?? ""),
    isDefault: Boolean(row.is_default),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export function isMissingCustomerTaxProfilesTable(error: unknown) {
  const err = error as { code?: string | null; message?: string | null } | null;
  return (
    err?.code === "42P01" ||
    err?.message?.includes("customer_tax_profiles") === true
  );
}
