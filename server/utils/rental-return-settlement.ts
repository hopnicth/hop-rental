/**
 * Return-settlement wrapper (T2, decisions.md §b addendum items 1-4).
 *
 * Orchestration ONLY — the money writer authority is the
 * f_settle_rental_booking_return RPC (migration 125), and the lifecycle
 * writer is the UNCHANGED completeRentalBookingFulfillment (byte-unchanged
 * pin — the T1a pickup path shares it). Order:
 *
 *   1. RPC: settlement row + held-balance release events, invariant
 *      asserted in SQL (held + additional = applied + refund).
 *   2. Legacy refund-proof row (when refund > 0) so the unchanged
 *      fulfillment's refund-proof assertion passes — the row points at the SAME
 *      private-bucket slip as the settlement (one file, two references).
 *   3. Fulfillment 'return': status picked_up → returned, logs, signature.
 *
 * SCOPED MAPPING (§b addendum item 7): fulfillment's refundAmount is CAPPED
 * at deposit_paid_amount — the legacy deposit_refund_* columns are
 * security-deposit-scoped and authoritative only for bookings WITHOUT a
 * settlement row. refundNotes always records the settlement id + the TRUE
 * total refund per the ledger.
 */
import { createError } from "h3";
import {
  assertRentalFulfillmentPrerequisites,
  completeRentalBookingFulfillment,
} from "~~/server/utils/rental-fulfillment";

type RentalFulfillmentResult = Awaited<
  ReturnType<typeof completeRentalBookingFulfillment>
>;

type AdminClient = Parameters<
  typeof completeRentalBookingFulfillment
>[0]["adminClient"];

export interface ReturnSettlementPenaltyLine {
  amount: number;
  note: string;
}

export interface ReturnSettlementInput {
  adminClient: AdminClient;
  userId: string;
  platformRole: string;
  bookingId: string;
  penaltyLines: ReturnSettlementPenaltyLine[];
  specialDiscountAmount: number;
  specialDiscountNote: string | null;
  // [143 R-A / 146] launch rental-base discount. The deposit regime refuses it;
  // the launch regime refuses penaltyLines/specialDiscount. The typed
  // staff-charge channel is REMOVED (decisions.md 2026-07-26 c) — this wrapper
  // sends no charge lines at all, so the RPC's p_staff_charge_lines default
  // (empty) applies and its removal RAISE is unreachable from the app.
  discountAmount: number;
  discountNote: string | null;
  // [146] RECORD-BUT-NO-MONEY memo (decisions.md 2026-07-26 b). TEXT ONLY: no
  // amount, no charge line, no document, no effect on any total. Optional at
  // this boundary ON PURPOSE — mandatory-when-late is the RPC's authority
  // (SETTLEMENT_MEMO_REQUIRED_FOR_LATE_RETURN), never a wrapper re-validation.
  staffMemo?: string | null;
  customerSignatureDataUrl: string;
  customerSignaturePath: string;
  staffSignaturePath: string;
  slipStoragePath: string | null;
  refundBankAccountRef: string | null;
  branchId: string | null;
  notes: string | null;
}

export interface ReturnSettlementResult {
  settlement: {
    settlementId: string;
    heldTotal: number;
    penaltyTotal: number;
    specialDiscountAmount: number;
    settlementAppliedAmount: number;
    refundAmount: number;
    additionalCollectionAmount: number;
    // [143 R-A / 146] launch return keys (RPC 146). No staff-charge total: the
    // channel is removed and the RPC no longer returns one.
    discountAmount: number;
    rentalBase: number;
  };
  fulfillment: RentalFulfillmentResult;
}

/**
 * RPC RAISE code -> { HTTP status, Thai user message }. Single source of truth
 * for surfacing f_settle_rental_booking_return refusals (migration 143) at the
 * HTTP boundary. Applied here for RPC errors and re-used by the endpoint for
 * its own shape-validation errors, so the map is one place and unit-testable
 * (the route file cannot be imported under vitest — defineEventHandler + the
 * h3 mock — so the map lives in the util the endpoint calls).
 *
 * Glossary rule (decisions.md 2026-07-07): NO bare "มัดจำ" in money copy. These
 * are rental / service-charge / discount errors, so deposit vocabulary never
 * appears. Thai copy is authored per the rule and pending owner confirmation.
 */
export function settleReturnRpcError(rawCode: string): {
  statusCode: number;
  statusMessage: string;
} {
  // Postgres RAISE messages carry a detail suffix (`CODE: %`, e.g.
  // "STAFF_CHARGE_EXCEEDS_CAP: 6000 (max 5000 per line)"). Map on the leading
  // token before the first colon so the specific status is never lost to the
  // prefix fallback.
  const code = (rawCode.split(":")[0] ?? rawCode).trim();
  const map: Record<string, { statusCode: number; statusMessage: string }> = {
    // Regime / channel — 409: wrong channel for the active deposit regime.
    // [146] Both refusals carry the SAME CHiP-ratified sentence: the web takes
    // no additional charge line of any kind, the detail goes in the memo, and
    // the bill is issued in the accounting program outside this system.
    PENALTY_LINES_NOT_ACCEPTED_AT_LAUNCH: {
      statusCode: 409,
      statusMessage:
        "ระบบไม่รองรับรายการเรียกเก็บเพิ่มเติม กรุณาบันทึกรายละเอียดในช่องหมายเหตุ และออกบิลเรียกเก็บภายนอกระบบ",
    },
    STAFF_CHARGE_CHANNEL_REMOVED: {
      statusCode: 409,
      statusMessage:
        "ระบบไม่รองรับรายการเรียกเก็บเพิ่มเติม กรุณาบันทึกรายละเอียดในช่องหมายเหตุ และออกบิลเรียกเก็บภายนอกระบบ",
    },
    LAUNCH_DISCOUNT_NOT_ACCEPTED_IN_DEPOSIT_REGIME: {
      statusCode: 409,
      statusMessage: "อยู่ในโหมดเงินประกัน ไม่รองรับส่วนลดแบบเปิดตัว",
    },
    // Discount — 422 (hard rules) / 403 (privilege tier).
    DISCOUNT_NEGATIVE: {
      statusCode: 422,
      statusMessage: "ส่วนลดต้องไม่ติดลบ",
    },
    DISCOUNT_NOTE_REQUIRED: {
      statusCode: 422,
      statusMessage: "กรุณาระบุหมายเหตุสำหรับส่วนลด",
    },
    DISCOUNT_WITHOUT_RENTAL_BASE: {
      statusCode: 422,
      statusMessage: "ไม่มีฐานค่าเช่าสำหรับการให้ส่วนลด",
    },
    DISCOUNT_EXCEEDS_MAX: {
      statusCode: 422,
      statusMessage: "ส่วนลดเกินเพดานสูงสุดที่ระบบอนุญาต (สูงสุด 50% ของค่าเช่า)",
    },
    DISCOUNT_REQUIRES_SUPER_ADMIN: {
      statusCode: 403,
      statusMessage:
        "ส่วนลดเกินสิทธิ์ของเจ้าหน้าที่ ต้องได้รับอนุมัติจากผู้ดูแลระบบระดับสูง",
    },
    // [146] Return memo — 422. The RPC refuses a LATE return with no memo;
    // Thai is CHiP-ratified verbatim (2026-07-26).
    SETTLEMENT_MEMO_REQUIRED_FOR_LATE_RETURN: {
      statusCode: 422,
      statusMessage: "กรุณาบันทึกหมายเหตุสำหรับการคืนล่าช้า",
    },
    // Actor — 422.
    SETTLEMENT_ACTOR_REQUIRED: {
      statusCode: 422,
      statusMessage: "ไม่พบรหัสเจ้าหน้าที่ผู้ทำรายการ",
    },
    SETTLEMENT_ACTOR_NOT_FOUND: {
      statusCode: 422,
      statusMessage: "ไม่พบบัญชีเจ้าหน้าที่ผู้ทำรายการในระบบ",
    },
  };
  const hit = map[code];
  if (hit) return hit;
  // Pre-existing deposit-era SETTLEMENT_* guards + launch prefixes without an
  // explicit entry: business 422 with a generic Thai message (the machine code
  // is still carried in error.data.settleRpcCode for logs/tests). [146] the
  // STAFF_CHARGE_ / CHARGE_TYPE_ prefix tests are GONE with the channel — the
  // only surviving STAFF_CHARGE_ code is mapped explicitly above.
  if (code.startsWith("SETTLEMENT_") || code.startsWith("DISCOUNT_")) {
    return {
      statusCode: 422,
      statusMessage: "ไม่สามารถปิดยอดการคืนได้ กรุณาตรวจสอบข้อมูล",
    };
  }
  // Anything else = infrastructure / unexpected.
  return {
    statusCode: 500,
    statusMessage: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง",
  };
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

export interface LaunchSettlementPreview {
  baseRental: number;
  dailyRate: number;
  lateDays: number;
  lateCharge: number;
  rentalBase: number;
}

/**
 * [146] LAUNCH preview — DISPLAY ONLY. Mirrors the derivation the RPC performs
 * from the locked booking row (base rental = rental_total; rental_extension =
 * daily_rate x late days, Asia/Bangkok, end_date EXCLUSIVE) so the panel can
 * show what will be collected BEFORE staff submit.
 *
 * This is NOT an authority: `f_settle_rental_booking_return` recomputes every
 * figure from the row it locks, and a divergence between this preview and the
 * RPC is the RPC's answer, not this one's. Kept pure so it is unit-testable
 * without a database.
 */
export function buildLaunchSettlementPreview(input: {
  rentalTotal: unknown;
  dailyRate: unknown;
  endDate: string | null;
  todayBangkok: string;
}): LaunchSettlementPreview {
  const baseRental = money(input.rentalTotal);
  // Multiply the RAW rate, then round ONCE — the RPC computes
  // round(daily_rate * late_days, 2) from the unrounded column, so rounding the
  // rate first would drift the preview off the figure staff are about to commit.
  const rawDailyRate = Number(input.dailyRate ?? 0);
  const dailyRate = Number.isFinite(rawDailyRate) ? money(rawDailyRate) : 0;
  const end = Date.parse(`${input.endDate ?? ""}T00:00:00Z`);
  const today = Date.parse(`${input.todayBangkok}T00:00:00Z`);
  const lateDays =
    Number.isFinite(end) && Number.isFinite(today)
      ? Math.max(0, Math.round((today - end) / 86_400_000))
      : 0;
  const lateCharge =
    lateDays > 0 && Number.isFinite(rawDailyRate)
      ? money(rawDailyRate * lateDays)
      : 0;
  return {
    baseRental,
    dailyRate,
    lateDays,
    lateCharge,
    rentalBase: money(baseRental + lateCharge),
  };
}

function canonicalLines(
  lines: Array<{ amount: number; note: string }>,
): string {
  return JSON.stringify(
    [...lines]
      .map((line) => ({ amount: money(line.amount), note: String(line.note).trim() }))
      .sort((a, b) => a.amount - b.amount || a.note.localeCompare(b.note)),
  );
}

export async function settleRentalBookingReturn(
  input: ReturnSettlementInput,
): Promise<ReturnSettlementResult> {
  const { adminClient, bookingId } = input;

  // 0a. PRE-VALIDATE (fix 1): every fulfillment precondition that can be
  // checked without money moving runs BEFORE the RPC. Probe payload uses
  // refund 0/not_applicable so the refund-proof assert self-skips — the two
  // asserts the probe cannot cover (refund cap, proof row) are satisfied by
  // construction in the real call (capped min(); proof inserted pre-call).
  await assertRentalFulfillmentPrerequisites({
    adminClient,
    userId: input.userId,
    platformRole: input.platformRole,
    bookingId,
    eventType: "return",
    payload: {
      signatureDataUrl: input.customerSignatureDataUrl,
      refundAmount: 0,
      refundStatus: "not_applicable",
      branchId: input.branchId,
    },
  });

  // 0b. RESUME (fix 2): a settlement row with the booking still picked_up is
  // a recoverable half-state (RPC committed, fulfillment interrupted).
  const { data: existingSettlement, error: existingError } = await adminClient
    .from("rental_booking_settlements")
    .select(
      "id, penalty_lines, special_discount_amount, settlement_applied_amount, refund_amount, additional_collection_amount, held_total, penalty_total, slip_evidence_ref",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (existingError) {
    throw createError({ statusCode: 500, statusMessage: existingError.message });
  }
  if (existingSettlement) {
    return await resumeSettledReturn(input, existingSettlement as Record<string, unknown>);
  }

  // 1. Settlement RPC — writer authority for the settlement row + ledger.
  //    [143 R-A] 13-arg signature: typed staff-charge lines + rental-base
  //    discount travel their own channel; penaltyLines/specialDiscount stay
  //    the deposit-era channel. The RPC discriminates the regime internally
  //    (f_deposits_enabled) and is the SOLE authority on cap/tier/taxonomy —
  //    the util passes shapes through, it does not re-validate substance.
  const { data: rpcResult, error: rpcError } = await adminClient.rpc(
    "f_settle_rental_booking_return",
    {
      p_booking_id: bookingId,
      p_penalty_lines: input.penaltyLines,
      p_special_discount_amount: input.specialDiscountAmount,
      p_special_discount_note: input.specialDiscountNote ?? null,
      p_customer_signature_path: input.customerSignaturePath,
      p_staff_signature_path: input.staffSignaturePath,
      p_slip_evidence_ref: input.slipStoragePath ?? null,
      p_refund_bank_account_ref: input.refundBankAccountRef ?? null,
      p_staff_user_id: input.userId,
      p_branch_id: input.branchId ?? null,
      p_discount_amount: input.discountAmount,
      p_discount_note: input.discountNote ?? null,
      p_staff_memo: input.staffMemo ?? null,
    },
  );
  if (rpcError) {
    const code = rpcError.message ?? "SETTLEMENT_RPC_FAILED";
    const mapped = settleReturnRpcError(code);
    throw createError({
      statusCode: mapped.statusCode,
      statusMessage: mapped.statusMessage,
      data: { settleRpcCode: code },
    });
  }
  const rpc = (rpcResult ?? {}) as Record<string, unknown>;
  const settlementId = String(rpc.settlement_id ?? "");
  const refundAmount = money(rpc.refund_amount);
  const additionalCollectionAmount = money(rpc.additional_collection_amount);

  // 2. Legacy refund-proof row (unchanged fulfillment requires it for
  //    refunds). Points at the SAME private-bucket slip.
  if (refundAmount > 0) {
    if (!input.slipStoragePath) {
      // The RPC's rbs_slip_required_chk makes this unreachable; belt+braces.
      throw createError({
        statusCode: 500,
        statusMessage: "SETTLEMENT_SLIP_MISSING_AFTER_RPC",
      });
    }
    const { error: proofError } = await adminClient
      .from("rental_booking_deposit_proofs")
      .insert({
        booking_id: bookingId,
        proof_kind: "refund",
        amount: refundAmount,
        payment_method: "bank_transfer",
        file_url: input.slipStoragePath,
        storage_bucket: "rental-deposit-slips",
        storage_path: input.slipStoragePath,
        notes: `return settlement ${settlementId}`,
        created_by_user_id: input.userId,
      });
    if (proofError) {
      throw createError({ statusCode: 500, statusMessage: proofError.message });
    }
  }

  // 3. Lifecycle via the UNCHANGED fulfillment. Scoped mapping: cap the
  //    legacy refund figure at the security-deposit column it describes.
  const { data: bookingRow, error: bookingError } = await adminClient
    .from("rental_bookings")
    .select("deposit_paid_amount")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) {
    throw createError({ statusCode: 500, statusMessage: bookingError.message });
  }
  const depositPaidAmount = money(
    (bookingRow as Record<string, unknown> | null)?.deposit_paid_amount,
  );
  const cappedRefund = Math.min(refundAmount, depositPaidAmount);
  const refundNotes = `return settlement ${settlementId}: total refund ${refundAmount.toFixed(2)} THB per held-balance ledger${
    additionalCollectionAmount > 0
      ? `; additional collection ${additionalCollectionAmount.toFixed(2)} THB`
      : ""
  }`;

  const fulfillment = await completeRentalBookingFulfillment({
    adminClient,
    userId: input.userId,
    platformRole: input.platformRole,
    bookingId,
    eventType: "return",
    payload: {
      signatureDataUrl: input.customerSignatureDataUrl,
      refundAmount: cappedRefund,
      refundStatus: refundAmount > 0 ? "refunded" : "not_applicable",
      refundNotes,
      branchId: input.branchId,
      notes: input.notes,
    },
  });

  return {
    settlement: {
      settlementId,
      heldTotal: money(rpc.held_total),
      penaltyTotal: money(rpc.penalty_total),
      specialDiscountAmount: money(rpc.special_discount_amount),
      settlementAppliedAmount: money(rpc.settlement_applied_amount),
      refundAmount,
      additionalCollectionAmount,
      discountAmount: money(rpc.discount_amount),
      rentalBase: money(rpc.rental_base),
    },
    fulfillment,
  };
}

/**
 * Fix 2 — crash-safe resume. Scope PINNED: settlement row exists AND booking
 * is still picked_up (the prerequisites probe above already proved
 * picked_up + checklist + signature; a returned booking never reaches here —
 * the probe 422s on status first). INTENT MATCH: the resubmitted figures
 * must equal the stored settlement; mismatch is an explicit error carrying
 * the stored figures — never a silent proceed on stale money.
 */
async function resumeSettledReturn(
  input: ReturnSettlementInput,
  stored: Record<string, unknown>,
): Promise<ReturnSettlementResult> {
  const { adminClient, bookingId } = input;
  const settlementId = String(stored.id ?? "");
  const storedLines = Array.isArray(stored.penalty_lines)
    ? (stored.penalty_lines as Array<{ amount: number; note: string }>)
    : [];
  const storedDiscount = money(stored.special_discount_amount);
  const refundAmount = money(stored.refund_amount);
  const additionalCollectionAmount = money(stored.additional_collection_amount);

  if (
    canonicalLines(input.penaltyLines) !== canonicalLines(storedLines) ||
    money(input.specialDiscountAmount) !== storedDiscount
  ) {
    throw createError({
      statusCode: 409,
      statusMessage: "SETTLEMENT_PENDING_MISMATCH",
      data: {
        stored: {
          settlementId,
          penaltyLines: storedLines,
          specialDiscountAmount: storedDiscount,
          settlementAppliedAmount: money(stored.settlement_applied_amount),
          refundAmount,
          additionalCollectionAmount,
        },
      },
    });
  }

  // Proof-row idempotence: only insert if the settlement's proof is missing.
  if (refundAmount > 0) {
    const { data: existingProof, error: proofLookupError } = await adminClient
      .from("rental_booking_deposit_proofs")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("notes", `return settlement ${settlementId}`)
      .maybeSingle();
    if (proofLookupError) {
      throw createError({
        statusCode: 500,
        statusMessage: proofLookupError.message,
      });
    }
    if (!existingProof) {
      const slipRef = String(stored.slip_evidence_ref ?? "");
      const { error: proofError } = await adminClient
        .from("rental_booking_deposit_proofs")
        .insert({
          booking_id: bookingId,
          proof_kind: "refund",
          amount: refundAmount,
          payment_method: "bank_transfer",
          file_url: slipRef,
          storage_bucket: "rental-deposit-slips",
          storage_path: slipRef,
          notes: `return settlement ${settlementId}`,
          created_by_user_id: input.userId,
        });
      if (proofError) {
        throw createError({ statusCode: 500, statusMessage: proofError.message });
      }
    }
  }

  // Resume audit (existing house pattern; action vocabulary is CHECK-locked
  // to manual_update|pos_create_override|return_refund — the resume marker
  // lives in change_summary/old_values, not a new action value).
  const { error: auditError } = await adminClient
    .from("rental_booking_deposit_action_logs")
    .insert({
      booking_id: bookingId,
      action: "return_refund",
      staff_user_id: input.userId,
      branch_id: input.branchId,
      old_values: { settlementId, stranded: true },
      new_values: { resumedBy: input.userId },
      change_summary: `return settlement ${settlementId} resumed (fulfillment half re-run)`,
    });
  if (auditError) {
    throw createError({ statusCode: 500, statusMessage: auditError.message });
  }

  const { data: bookingRow, error: bookingError } = await adminClient
    .from("rental_bookings")
    .select("deposit_paid_amount")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) {
    throw createError({ statusCode: 500, statusMessage: bookingError.message });
  }
  const depositPaidAmount = money(
    (bookingRow as Record<string, unknown> | null)?.deposit_paid_amount,
  );
  const cappedRefund = Math.min(refundAmount, depositPaidAmount);
  const refundNotes = `return settlement ${settlementId}: total refund ${refundAmount.toFixed(2)} THB per held-balance ledger (resumed)`;

  const fulfillment = await completeRentalBookingFulfillment({
    adminClient,
    userId: input.userId,
    platformRole: input.platformRole,
    bookingId,
    eventType: "return",
    payload: {
      signatureDataUrl: input.customerSignatureDataUrl,
      refundAmount: cappedRefund,
      refundStatus: refundAmount > 0 ? "refunded" : "not_applicable",
      refundNotes,
      branchId: input.branchId,
      notes: input.notes,
    },
  });

  return {
    settlement: {
      settlementId,
      heldTotal: money(stored.held_total),
      penaltyTotal: money(stored.penalty_total),
      specialDiscountAmount: storedDiscount,
      settlementAppliedAmount: money(stored.settlement_applied_amount),
      refundAmount,
      additionalCollectionAmount,
      // Resume re-runs ONLY the fulfillment half (the RPC already committed the
      // money). The launch discount is not stored on the settlement row (R-C),
      // so it is not recomputed here — 0 placeholder; no consumer reads it on
      // the resume path (the panel ignores the response body).
      discountAmount: 0,
      rentalBase: 0,
    },
    fulfillment,
  };
}
