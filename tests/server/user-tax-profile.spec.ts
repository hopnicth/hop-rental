import { describe, expect, it } from "vitest";
import {
  isMissingCustomerTaxProfilesTable,
  mapCustomerTaxProfile,
  normalizeTaxId,
  requireCustomerTaxProfileInput,
} from "../../server/utils/user-tax-profile";

describe("user tax profile helpers", () => {
  it("normalizes tax ids", () => {
    expect(normalizeTaxId(" 01055-55555-123 ")).toBe("0105555555123");
  });

  it("validates person payload and coerces branch fields", () => {
    const payload = requireCustomerTaxProfileInput({
      customerKind: "person",
      legalName: "Jane Doe",
      taxId: "1234-567890",
      branchType: "branch",
      branchCode: "001",
      billingAddress: "Bangkok",
      phone: "0812345678",
      email: "jane@example.com",
    });

    expect(payload.customerKind).toBe("person");
    expect(payload.branchType).toBe("none");
    expect(payload.branchCode).toBe("");
    expect(payload.taxIdNormalized).toBe("1234567890");
  });

  it("requires branch code when branch type is branch", () => {
    expect(() =>
      requireCustomerTaxProfileInput({
        customerKind: "company",
        legalName: "Hopnic Co., Ltd.",
        taxId: "0105555123456",
        branchType: "branch",
        branchCode: " ",
        billingAddress: "Bangkok",
        phone: "",
        email: "tax@hopnic.test",
      }),
    ).toThrow(/branchCode/i);
  });

  it("maps rows and detects missing schema", () => {
    const mapped = mapCustomerTaxProfile({
      id: "tax-1",
      customer_kind: "company",
      legal_name: "Hopnic Co., Ltd.",
      tax_id: "0105555123456",
      tax_id_normalized: "0105555123456",
      branch_type: "head_office",
      branch_code: "",
      billing_address: "Bangkok",
      phone: "02-000-0000",
      email: "tax@hopnic.test",
      review_status: "draft",
      reviewed_at: null,
      rejection_reason: "",
      is_default: true,
      created_at: "2026-05-11T00:00:00.000Z",
      updated_at: "2026-05-11T00:00:00.000Z",
    });

    expect(mapped).toMatchObject({
      id: "tax-1",
      customerKind: "company",
      branchType: "head_office",
      isDefault: true,
    });
    expect(isMissingCustomerTaxProfilesTable({ code: "42P01" })).toBe(true);
    expect(
      isMissingCustomerTaxProfilesTable({
        message: "relation customer_tax_profiles does not exist",
      }),
    ).toBe(true);
  });
});