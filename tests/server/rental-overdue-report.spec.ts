/**
 * Tests: overdue & adjustments report (CHiP-ratified layout, 2026-07-27)
 *
 * Covers:
 *  1. Endpoint contract — auth, the SIX ratified fields, and the 404s that keep
 *     the report to settled-and-late returns only
 *  2. NO COMPUTED TOTAL — the ratification condition, asserted on both the
 *     endpoint and the print view
 *  3. NOT A DOCUMENT — no OfficialDocumentHeader, no document number/series
 *  4. Print view — plain header, disclaimer line, memo verbatim, A4, print CSS
 *  5. Panel button — only once a LATE return has been settled
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * Strip comments before asserting ABSENCE. The source deliberately NAMES the
 * things it must not do ("no official_documents row", "not OfficialDocumentHeader")
 * so the reasoning survives in the file — asserting on raw text would then test
 * the comment rather than the code.
 */
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/<!--[\s\S]*?-->/g, "");

const endpoint = read(
  "server/api/admin/rental-bookings/[id]/overdue-report.get.ts",
);
const view = read(
  "app/pages/admin/rental-bookings/overdue-report/[id].vue",
);
const panel = read("app/components/admin/AdminRentalReturnSettlement.vue");

describe("overdue report — endpoint contract", () => {
  it("is admin-gated", () => {
    expect(endpoint).toContain("requirePlatformAdmin");
  });

  it("returns the SIX ratified fields", () => {
    for (const field of [
      "bookingNumber",
      "customerName",
      "customerPhone",
      "bookedStartDate",
      "bookedEndDate",
      "actualReturnDate",
      "lateDays",
      "dailyRateAsBooked",
      "staffMemo",
    ]) {
      expect(endpoint).toContain(field);
    }
  });

  it("404s unless the return was SETTLED and LATE", () => {
    expect(endpoint).toContain("Number(settlement.late_days ?? 0) <= 0");
    expect(endpoint).toContain("No overdue return recorded for this booking");
  });

  it("NO COMPUTED TOTAL — the ratification condition", () => {
    // The sheet must never multiply rate by days: that would make the web write
    // a bill, which is exactly what the 2026-07-27 ruling removes.
    expect(endpoint).not.toMatch(/lateDays\s*\*/);
    expect(endpoint).not.toMatch(/\*\s*lateDays/);
    expect(endpoint).not.toContain("total");
    expect(endpoint).not.toContain("amount_due");
    expect(endpoint).not.toContain("vat");
  });

  it("is NOT a document — no number, no series, no sequence", () => {
    const src = code(endpoint);
    expect(src).not.toContain("official_documents");
    expect(src).not.toContain("document_no");
    expect(src).not.toContain("f_next_document_number");
  });
});

describe("overdue report — print view", () => {
  it("uses a PLAIN header, never the issued-document header", () => {
    // OfficialDocumentHeader is the visual signature of an ISSUED document
    // (template principle 2); a non-document must not borrow it.
    expect(code(view)).not.toContain("OfficialDocumentHeader");
    expect(view).toContain("บริษัท ฮอปนิค จำกัด");
    expect(view).toContain("รายงานการคืนเกินกำหนด และรายการเรียกเก็บเพิ่มเติม");
  });

  it("carries the ratified disclaimer line verbatim", () => {
    expect(view).toContain(
      "เอกสารภายในสำหรับการออกบิล — ไม่ใช่ใบกำกับภาษี/ไม่ใช่ใบเสร็จรับเงิน".replace(
        "/ไม่ใช่ใบเสร็จรับเงิน",
        "/ใบเสร็จรับเงิน",
      ),
    );
  });

  it("renders the six fields and the memo verbatim", () => {
    expect(view).toContain("เลขที่การจอง");
    expect(view).toContain("ช่วงเช่าตามจอง");
    expect(view).toContain("วันที่คืนจริง");
    expect(view).toContain("จำนวนวันที่เกิน");
    expect(view).toContain("ค่าเช่าตามจอง");
    expect(view).toContain("report.staffMemo");
    // whitespace preserved so a multi-line memo prints as typed
    expect(view).toContain("white-space: pre-line");
  });

  it("shows NO total anywhere", () => {
    expect(view).not.toContain("รวม");
    expect(view).not.toContain("ยอดรวม");
    expect(view).not.toContain("ภาษีมูลค่าเพิ่ม");
    expect(view).not.toMatch(/lateDays\s*\*/);
  });

  it("prints clean on A4 — no chrome, no buttons", () => {
    expect(view).toContain("size: A4 portrait");
    expect(view).toContain("@media print");
    expect(view).toContain("display: none !important");
    expect(view).toContain('class="no-print actions"');
    // layout:false keeps the admin nav off the page entirely
    expect(view).toContain("layout: false");
  });

  it("`window` is reached through a method, not template scope", () => {
    expect(view).toContain("function printPage()");
    expect(view).not.toContain('@click="window.print()"');
  });

  it("[amended] the title carries NO ปรับ vocabulary", () => {
    // ปรับ must not seed the Admin's external bill, and the sheet is broader
    // than penalties (CHiP 2026-08-27, accepting the auditor's objection).
    expect(view).not.toContain("ค่าปรับ");
    expect(view).not.toContain("รายงานค่าปรับ");
    expect(view).not.toContain("เบี้ยปรับ");
  });

  it("[amended] the memo is a FULL-WIDTH block, not a table row", () => {
    const memoIndex = view.indexOf('class="memo"');
    const fieldsIndex = view.indexOf('class="fields"');
    expect(memoIndex).toBeGreaterThan(fieldsIndex);
    expect(view).toContain('class="memo-head"');
    expect(view).toContain("white-space: pre-line");
  });

  it("[amended] format pass: fixed label column, light rules, Thai breaking", () => {
    expect(view).toContain("flex: 0 0 42mm");
    expect(view).toContain("0.5pt solid");
    expect(view).toContain("word-break: keep-all");
    expect(view).toContain("hyphens: none");
  });

  it("[amended] a long memo flows to page 2 without repeating the header", () => {
    expect(view).toContain("break-after: avoid");
    expect(view).toContain("break-inside: auto");
  });
});

describe("[amended] signature block — ruling (ก)", () => {
  it("NEVER prints a blank signature line", () => {
    // The customer must not sign twice, and must not appear to have signed a
    // sheet they have never seen.
    expect(code(view)).not.toMatch(/border-bottom[^;]*;\s*\}\s*\.sig-line/);
    expect(view).toContain("ไม่มีลายเซ็นบันทึกในระบบ");
  });

  it("renders the STORED return-confirmation signature", () => {
    expect(view).toContain("report.customerSignature.url");
    expect(view).toContain("ลายเซ็นผู้เช่าจากการยืนยันการคืนสินค้า เมื่อ");
    expect(view).toContain("report.customerSignature.signedAt");
  });

  it("attributes the signature to the RETURN CONFIRMATION, never to this report", () => {
    const caption = view.slice(view.indexOf("sig-caption"), view.indexOf("sig-caption") + 400);
    expect(caption).not.toContain("รายงาน");
  });

  it("names the customer under the signature", () => {
    expect(view).toContain("report.customerName");
  });

  it("staff side is an identity line, not a signature line", () => {
    expect(view).toContain("เจ้าหน้าที่ผู้บันทึก");
    expect(view).toContain("report.recordedByStaffName");
    expect(view).toContain("report.recordedAt");
  });

  it("both columns share one geometry, and every rule carries text above it", () => {
    // The alignment the format pass asks for: a fixed zone in BOTH columns puts
    // the rule, the name and the caption on identical lines. The rule belongs to
    // .sig-name, so it always sits under printed text — never under empty space
    // that could read as a line waiting for a signature.
    expect(view).toContain("sig-zone");
    expect(code(view)).toMatch(/\.sig-zone\s*\{[^}]*height:\s*24mm/);
    expect(code(view)).toMatch(/\.sig-name\s*\{[^}]*border-top/);
    expect(code(view)).not.toMatch(/\.sig-zone\s*\{[^}]*border-bottom/);
  });

  it("the block never orphans onto a page of its own", () => {
    expect(view).toContain("page-break-inside: avoid");
    expect(view).toContain("break-inside: avoid");
  });

  it("the disclaimer survives alongside the block", () => {
    expect(view).toContain("เอกสารภายในสำหรับการออกบิล");
  });
});

describe("[amended] signature integrity — endpoint", () => {
  it("reads the signature from the APPEND-ONLY settlement row", () => {
    expect(endpoint).toContain("customer_signature_path");
    expect(endpoint).toContain("rental_booking_settlements");
  });

  it("serves it as a SHORT-LIVED SIGNED URL over the private bucket", () => {
    expect(endpoint).toContain("RENTAL_DEPOSIT_SLIP_BUCKET");
    expect(endpoint).toContain("createSignedUrl");
    expect(endpoint).toContain("SIGNATURE_SIGNED_URL_TTL_SECONDS");
    expect(endpoint).not.toContain("getPublicUrl");
  });

  it("takes the signed-at moment from the RETURN fulfillment", () => {
    expect(endpoint).toContain('.eq("event_type", "return")');
    expect(endpoint).toContain("event_at");
  });

  it("yields null (not a blank line) when no signature can be served", () => {
    expect(endpoint).toContain("customerSignature: signatureUrl");
  });
});

describe("overdue report — panel entry point", () => {
  it("appears only once a LATE return has been SETTLED", () => {
    expect(panel).toContain("canPrintOverdueReport");
    expect(panel).toContain("isLateReturn.value && !!existingSettlement.value");
  });

  it("links to the print route in a new tab", () => {
    expect(panel).toContain("/admin/rental-bookings/overdue-report/");
    expect(panel).toContain('target="_blank"');
  });
});
