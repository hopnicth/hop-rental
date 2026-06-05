/**
 * Tests: Admin KYC Documents Panel v1 — UI contract (source inspection)
 *
 * Covers (over the panel component, the /admin/kyc page, and the admin layout):
 *  1. Endpoint contract — list/upload/download call EXACTLY the existing KYC
 *     APIs; lookup is a POST (identity never travels in a query string)
 *  2. Leak guard — no storage path / bucket / signed / public URL identifiers,
 *     no localStorage/sessionStorage, anywhere in the admin KYC UI sources
 *  3. No inline preview — no iframe/embed/object tags; no <img> bound to
 *     document bytes; download is the only byte path
 *  4. Role gate — Download button rendered only for platformRole super_admin;
 *     403 is still handled with a clean toast (server stays authoritative)
 *  5. Upload form — FormData with file/documentType/issuedAt/expiresAt against
 *     the existing upload API; list is re-fetched after a successful upload
 *  6. Download handling — blob + object URL with NEXT-TICK revoke (synchronous
 *     revoke can cancel downloads); filename parsed from the server
 *     Content-Disposition header, never built from customer/profile fields
 *  7. No manual audit logging from the UI
 *  8. Page/nav wiring — admin layout + role middleware; nav entry exists;
 *     raw identity value cleared from state after lookup
 *  9. Create-pending-profile flow — POST /api/admin/kyc/profiles (body-only
 *     identity), coherence-mirrored type options, raw identity cleared after
 *     submit, success feeds the SAME profile render path as lookup, and no
 *     verify/approve/reject/delete affordance exists
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const panelSrc = read("app/components/admin/kyc/AdminKycDocumentsPanel.vue");
const pageSrc = read("app/pages/admin/kyc/index.vue");
const layoutSrc = read("app/layouts/admin.vue");
const typesSrc = read("app/types/admin-kyc.ts");
const kycUiSources: Array<[string, string]> = [
  ["panel", panelSrc],
  ["page", pageSrc],
  ["types", typesSrc],
];

describe("endpoint contract", () => {
  it("panel lists and uploads via /api/admin/kyc/profiles/:id/documents", () => {
    const calls = panelSrc.match(
      /\/api\/admin\/kyc\/profiles\/\$\{props\.profile\.id\}\/documents/g,
    );
    expect(calls?.length).toBeGreaterThanOrEqual(2); // list GET + upload POST
  });

  it("panel downloads via the server-proxy endpoint only", () => {
    expect(panelSrc).toContain("/api/admin/kyc/documents/");
    expect(panelSrc).toContain("/download");
  });

  it("page lookup is a POST with the identity in the body, never a query string", () => {
    expect(pageSrc).toContain("/api/admin/kyc/profiles/lookup");
    expect(pageSrc).toContain('method: "POST"');
    expect(pageSrc).not.toMatch(/identityValue=/); // no query-string identity
  });
});

describe("leak guard — banned identifiers never appear in admin KYC UI sources", () => {
  const BANNED = [
    "storage_path",
    "storagePath",
    "storage_bucket",
    "storageBucket",
    "createSignedUrl",
    "getPublicUrl",
    "signedUrl",
    "localStorage",
    "sessionStorage",
  ];

  it.each(kycUiSources)("%s source is clean", (_label, src) => {
    for (const banned of BANNED) {
      expect(src).not.toContain(banned);
    }
  });
});

describe("no inline preview", () => {
  it.each(kycUiSources)(
    "%s has no iframe/embed/object preview elements",
    (_label, src) => {
      expect(src).not.toContain("<iframe");
      expect(src).not.toContain("<embed");
      expect(src).not.toContain("<object");
    },
  );

  it("panel never binds document bytes or object URLs into an <img>", () => {
    // The only <img>-ish usage allowed is UIcon; no :src bound to a blob/object URL.
    expect(panelSrc).not.toMatch(/<img[^>]*:src/);
    expect(panelSrc).not.toMatch(/:src="[^"]*(url|blob|object)/i);
  });
});

describe("role gate", () => {
  it("Download button is gated on platformRole === 'super_admin'", () => {
    expect(panelSrc).toContain('platformRole === "super_admin"');
    expect(panelSrc).toContain('v-if="isSuperAdmin"');
  });

  it("403 from the server is still handled with a clean message (role drift)", () => {
    expect(panelSrc).toContain("403");
    expect(panelSrc).toContain("Super admin access required");
  });
});

describe("upload form", () => {
  it("posts FormData with the upload API's exact field names", () => {
    expect(panelSrc).toContain("new FormData()");
    expect(panelSrc).toContain('fd.append("file"');
    expect(panelSrc).toContain('fd.append("documentType"');
    expect(panelSrc).toContain('fd.append("issuedAt"');
    expect(panelSrc).toContain('fd.append("expiresAt"');
  });

  it("re-fetches the list after a successful upload", () => {
    const submitBody = panelSrc.slice(
      panelSrc.indexOf("async function submitUpload"),
      panelSrc.indexOf("// ── Download"),
    );
    expect(submitBody).toContain("await loadDocuments()");
  });

  it("restricts the file input to the server MIME allowlist", () => {
    expect(panelSrc).toContain(
      'accept="image/jpeg,image/png,application/pdf"',
    );
  });

  it("mirrors the company_cert issuedAt requirement client-side", () => {
    expect(panelSrc).toContain('"company_cert"');
    expect(panelSrc).toContain("issuedAtRequired");
  });
});

describe("download handling", () => {
  it("uses a transient object URL with NEXT-TICK revoke (never synchronous)", () => {
    expect(panelSrc).toContain("URL.createObjectURL");
    expect(panelSrc).toContain(
      "setTimeout(() => URL.revokeObjectURL(url), 0)",
    );
    // No bare synchronous revoke directly after click.
    expect(panelSrc).not.toMatch(/anchor\.click\(\);\s*URL\.revokeObjectURL/);
  });

  it("filename comes from the server Content-Disposition header only", () => {
    expect(panelSrc).toContain("content-disposition");
    expect(panelSrc).toContain('filename="([^"]+)"');
    // Fallback is the opaque document id — never identity/profile fields.
    expect(panelSrc).toContain("`kyc-${doc.id}`");
    expect(panelSrc).not.toMatch(/download\s*=\s*[^/]*identity/i);
  });
});

describe("no manual audit logging from the UI", () => {
  it.each(kycUiSources)("%s never references the access log", (_label, src) => {
    expect(src).not.toContain("kyc_document_access_log");
    expect(src).not.toContain("logKycDocumentAccess");
  });
});

describe("page + nav wiring", () => {
  it("page uses the admin layout and platform-role middleware", () => {
    expect(pageSrc).toContain('layout: "admin"');
    expect(pageSrc).toContain('middleware: ["role"]');
    expect(pageSrc).toContain('platformRoles: ["staff", "super_admin"]');
  });

  it("admin nav links to /admin/kyc in the staff-visible group", () => {
    expect(layoutSrc).toContain('{ label: "KYC", to: "/admin/kyc" }');
    // Must not be inside the super_admin-only block (which starts after this check).
    const superAdminBlock = layoutSrc.slice(
      layoutSrc.indexOf('platformRole === "super_admin"'),
    );
    expect(superAdminBlock).not.toContain('to: "/admin/kyc"');
  });

  it("raw identity value is cleared from state after every lookup", () => {
    const finallyBlock = pageSrc.slice(pageSrc.indexOf("} finally {"));
    expect(finallyBlock).toContain('identityValue.value = ""');
  });

  it("page renders the masked identityLast4 only — never a raw identity binding", () => {
    expect(pageSrc).toContain("identityLast4");
    expect(pageSrc).not.toMatch(/\{\{\s*identityValue/);
    expect(pageSrc).not.toMatch(/\{\{\s*create\.identityValue/);
  });
});

describe("create pending profile flow", () => {
  it("posts exactly to /api/admin/kyc/profiles with the identity in the body", () => {
    const createBody = pageSrc.slice(
      pageSrc.indexOf("async function createProfile"),
      pageSrc.indexOf("function formatDate"),
    );
    expect(createBody).toContain('"/api/admin/kyc/profiles"');
    expect(createBody).toContain('method: "POST"');
    expect(createBody).toContain("identityValue: create.identityValue");
    // never in a URL/query string
    expect(pageSrc).not.toMatch(/profiles\?/);
    expect(pageSrc).not.toMatch(/identityValue=/);
  });

  it("clears the raw identity from state after every create submit", () => {
    const createBody = pageSrc.slice(
      pageSrc.indexOf("async function createProfile"),
      pageSrc.indexOf("function formatDate"),
    );
    const finallyBlock = createBody.slice(createBody.indexOf("} finally {"));
    expect(finallyBlock).toContain('create.identityValue = ""');
  });

  it("success feeds the SAME profile render path as a lookup hit", () => {
    // Both handlers assign the response profile into the single `profile` ref
    // that gates the profile card + documents panel.
    const assignments = pageSrc.match(/profile\.value = res\.profile/g) ?? [];
    expect(assignments.length).toBeGreaterThanOrEqual(2);
    expect(pageSrc).toContain('<AdminKycDocumentsPanel :profile="profile" />');
  });

  it("mirrors the customerType × identityType coherence guard", () => {
    expect(pageSrc).toContain("CREATE_IDENTITY_OPTIONS");
    expect(pageSrc).toContain('"juristic_id"');
    // identity-type options are derived from the selected customer type
    expect(pageSrc).toContain("CREATE_IDENTITY_OPTIONS[create.customerType]");
  });

  it("create form only appears when no profile is selected", () => {
    expect(pageSrc).toMatch(/<UCard v-if="!profile">/);
  });

  it("no verify/approve/reject/delete/purge affordance anywhere in the admin KYC UI", () => {
    for (const [, src] of kycUiSources) {
      expect(src).not.toMatch(/label="(Verify|Approve|Reject|Delete|Purge)/i);
      expect(src).not.toMatch(/method:\s*"(DELETE|PATCH|PUT)"/);
    }
  });
});
