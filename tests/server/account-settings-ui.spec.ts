import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("account settings UI wiring", () => {
  it("does not wire the Account Lifecycle section into account settings", () => {
    const page = read("app/pages/user/account.vue");
    const sidebar = read("app/components/account/AccountSidebar.vue");

    expect(page).not.toContain("import SectionAccountLifecycle");
    expect(page).not.toContain(
      "accountLifecycle: markRaw(SectionAccountLifecycle)",
    );
    expect(sidebar).not.toContain('id: "accountLifecycle"');
  });

  it("uses Supabase reset password email UX", () => {
    const security = read("app/components/account/SectionSecurity.vue");

    expect(security).toContain("resetPasswordForEmail");
    expect(security).toContain("/user/reset-password");
    expect(security).toContain("sendResetPasswordEmail");
    expect(security).toContain(':disabled="!canSendResetPasswordEmail"');
    expect(security).not.toContain("<UForm");
    expect(security).not.toContain("validatePasswordForm");
    expect(security).not.toContain("getPasswordPolicyChecks");
  });

  it("surfaces read-only email and mobile verification status", () => {
    const security = read("app/components/account/SectionSecurity.vue");
    const profile = read("app/components/account/SectionProfile.vue");

    expect(security).toContain("emailVerification");
    expect(security).toContain("isEmailVerified");
    expect(security).not.toContain("resendVerificationEmail");
    expect(security).not.toContain("pendingVerification");
    expect(profile).toContain("mobileRegistration");
    expect(profile).toContain("phone_confirmed_at");
    expect(profile).toContain(
      "Boolean(fullName.value.trim() || phone.value.trim())",
    );
  });

  it("uses the same billing address label key in the tax section and sidebar", () => {
    const taxProfile = read("app/components/account/SectionTaxProfile.vue");
    const sidebar = read("app/components/account/AccountSidebar.vue");

    expect(taxProfile).toContain('t("user.taxProfile")');
    expect(taxProfile).toContain('t("user.taxProfileSubtitle")');
    expect(sidebar).toContain('label: t("user.taxProfile")');
  });

  it("uses detailed B2C KYC consent and server-side private upload", () => {
    const kyc = read("app/components/account/SectionKyc.vue");

    expect(kyc).toContain("kycConsentFullTitle");
    expect(kyc).toContain("kycConsentDataCollectedTitle");
    expect(kyc).toContain("kycConsentCheckboxDetailed");
    expect(kyc).toContain("kycUploadInProgressTitle");
    expect(kyc).toContain("savingConsent");
    expect(kyc).toContain("canUploadKycDocument");
    expect(kyc).toContain("/api/user/kyc/id-card");
    expect(kyc).not.toContain('storage.from("kyc-documents")');
    expect(kyc).not.toContain("getPublicUrl");
  });

  it("uses server-side private upload for Company KYC documents", () => {
    const companyKyc = read("app/components/account/SectionCompanyKyc.vue");

    expect(companyKyc).toContain("/api/company/kyc/document");
    expect(companyKyc).not.toContain("supabase.storage");
    expect(companyKyc).not.toContain("getPublicUrl");
    expect(companyKyc).not.toContain("kyc_documents: existing");
  });
});
