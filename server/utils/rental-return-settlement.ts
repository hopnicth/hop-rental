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
  };
  fulfillment: RentalFulfillmentResult;
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
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
    },
  );
  if (rpcError) {
    const msg = rpcError.message ?? "f_settle_rental_booking_return failed";
    throw createError({
      statusCode: msg.startsWith("SETTLEMENT_") ? 422 : 500,
      statusMessage: msg,
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
    },
    fulfillment,
  };
}
