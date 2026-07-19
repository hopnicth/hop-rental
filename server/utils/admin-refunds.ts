import { createError } from "h3";
import {
  documentPeriod,
  mapOfficialDocumentRow,
  resolveDocumentHeaderSnapshot,
  OFFICIAL_DOCUMENT_SELECT,
} from "~~/server/utils/admin-documents";
import { fetchAdminCustomerProfile } from "~~/server/utils/admin-orders";

type Row = Record<string, unknown>;
type AnyClient = {
  from(table: string): any;
  rpc?: (
    name: string,
    params: Row,
  ) => Promise<{
    data: unknown;
    error: { message?: string; code?: string } | null;
  }>;
};

const REFUND_SELECT =
  "id, refund_type, booking_id, user_id, cancellation_event_id, original_payment_source_type, original_rental_booking_payment_attempt_id, original_mixed_payment_allocation_id, gateway, gateway_charge_id, gateway_payment_reference, refund_amount, currency_code, refund_bank_name, refund_bank_account_number, refund_bank_account_name, refund_contact_phone, customer_note, customer_confirmed_destination_at, status, requested_at, processing_at, needs_customer_contact_at, refunded_at, failed_at, processed_by_user_id, admin_note, manual_transfer_reference, refund_proof_id, created_at, updated_at";
const BOOKING_SELECT =
  "id, user_id, status, product_name, asset_name, matched_product_name, asset_code, start_date, end_date, rental_days, hub_id, hub_name, booker_name, booker_phone, deposit_amount, booking_deposit_paid_amount, booking_deposit_payment_status, currency_code";
const EVENT_SELECT =
  "id, booking_id, user_id, cancelled_at, cancellation_initiator, cancellation_source, refund_cutoff_date_snapshot, refund_eligible, refund_amount_due, pickup_date_snapshot";
const PROOF_SELECT =
  "id, booking_id, proof_kind, amount, payment_method, file_url, storage_bucket, storage_path, mime_type, file_size_bytes, notes, created_by_user_id, created_at";
const REFUND_DOCUMENT_TYPE = "rental_booking_deposit_refund_confirmation";
const VALID_STATUSES = new Set([
  "pending_admin_review",
  "processing",
  "needs_customer_contact",
  "refunded",
  "failed",
]);
const REFUND_STATUSES = [
  "pending_admin_review",
  "processing",
  "needs_customer_contact",
  "refunded",
  "failed",
] as const;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function nullable(value: unknown): string | null {
  const clean = text(value);
  return clean || null;
}
function money(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}
function rowOrNull(value: unknown): Row | null {
  return value && typeof value === "object" ? (value as Row) : null;
}
function documentSummary(doc: Row | null) {
  return doc
    ? {
        id: doc.id,
        documentType: doc.documentType,
        documentNo: doc.documentNo,
        status: doc.status,
        issuedAt: doc.issuedAt,
      }
    : null;
}

async function maybeOne(
  client: AnyClient,
  table: string,
  select: string,
  key: string,
  value: unknown,
) {
  if (!value) return null;
  const { data, error } = await client
    .from(table)
    .select(select)
    .eq(key, value)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  return rowOrNull(data);
}

async function loadRefund(client: AnyClient, refundId: string): Promise<Row> {
  const row = await maybeOne(
    client,
    "payment_refunds",
    REFUND_SELECT,
    "id",
    refundId,
  );
  if (!row || text(row.refund_type) !== "rental_booking_deposit")
    throw createError({
      statusCode: 404,
      statusMessage: "Refund request not found",
    });
  return row;
}

async function loadDocumentBySource(
  client: AnyClient,
  sourceType: string,
  sourceId: string,
  documentType: string,
) {
  const { data, error } = await client
    .from("official_documents")
    .select(OFFICIAL_DOCUMENT_SELECT)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .eq("document_type", documentType)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  return data ? mapOfficialDocumentRow(data as Row) : null;
}

async function assertRefundProofBelongsToRefund(
  client: AnyClient,
  refund: Row,
  proofId: string,
) {
  const proof = await maybeOne(
    client,
    "rental_booking_deposit_proofs",
    PROOF_SELECT,
    "id",
    proofId,
  );
  if (
    !proof ||
    text(proof.booking_id) !== text(refund.booking_id) ||
    text(proof.proof_kind) !== "refund"
  ) {
    throw createError({
      statusCode: 422,
      statusMessage: "Refund proof does not belong to this refund",
    });
  }
  return proof;
}

async function hydrateRefund(client: AnyClient, refund: Row) {
  const [booking, cancellation, proof, refundDocument, cancellationDocument] =
    await Promise.all([
      maybeOne(
        client,
        "rental_bookings",
        BOOKING_SELECT,
        "id",
        refund.booking_id,
      ),
      maybeOne(
        client,
        "rental_booking_cancellation_events",
        EVENT_SELECT,
        "id",
        refund.cancellation_event_id,
      ),
      maybeOne(
        client,
        "rental_booking_deposit_proofs",
        PROOF_SELECT,
        "id",
        refund.refund_proof_id,
      ),
      loadDocumentBySource(
        client,
        "payment_refund",
        text(refund.id),
        REFUND_DOCUMENT_TYPE,
      ),
      refund.cancellation_event_id
        ? loadDocumentBySource(
            client,
            "rental_booking_cancellation_event",
            text(refund.cancellation_event_id),
            "rental_booking_cancellation_confirmation",
          )
        : Promise.resolve(null),
    ]);
  const customer = refund.user_id
    ? await fetchAdminCustomerProfile(client as never, text(refund.user_id))
    : null;
  return {
    id: text(refund.id),
    status: text(refund.status),
    refundType: text(refund.refund_type),
    requestedAt: text(refund.requested_at),
    processingAt: nullable(refund.processing_at),
    needsCustomerContactAt: nullable(refund.needs_customer_contact_at),
    refundedAt: nullable(refund.refunded_at),
    failedAt: nullable(refund.failed_at),
    refundAmount: money(refund.refund_amount),
    currencyCode: text(refund.currency_code) || "THB",
    adminNote: nullable(refund.admin_note),
    manualTransferReference: nullable(refund.manual_transfer_reference),
    processedByUserId: nullable(refund.processed_by_user_id),
    destination: {
      bankName: text(refund.refund_bank_name),
      bankAccountNumber: text(refund.refund_bank_account_number),
      bankAccountName: text(refund.refund_bank_account_name),
      contactPhone: text(refund.refund_contact_phone),
      customerNote: nullable(refund.customer_note),
      customerConfirmedAt: text(refund.customer_confirmed_destination_at),
    },
    originalPayment: {
      sourceType: text(refund.original_payment_source_type),
      paymentAttemptId: nullable(
        refund.original_rental_booking_payment_attempt_id,
      ),
      mixedAllocationId: nullable(refund.original_mixed_payment_allocation_id),
      gateway: nullable(refund.gateway),
      gatewayChargeId: nullable(refund.gateway_charge_id),
      gatewayPaymentReference: nullable(refund.gateway_payment_reference),
    },
    booking: booking
      ? {
          id: text(booking.id),
          status: text(booking.status),
          itemName:
            text(booking.asset_name) ||
            text(booking.matched_product_name) ||
            text(booking.product_name),
          assetCode: nullable(booking.asset_code),
          startDate: text(booking.start_date),
          endDate: text(booking.end_date),
          rentalDays: Number(booking.rental_days ?? 0),
          hubId: nullable(booking.hub_id),
          hubName: nullable(booking.hub_name),
          bookerName: nullable(booking.booker_name),
          bookerPhone: nullable(booking.booker_phone),
          depositAmount: money(booking.deposit_amount),
          bookingDepositPaidAmount: money(booking.booking_deposit_paid_amount),
          bookingDepositPaymentStatus: text(
            booking.booking_deposit_payment_status,
          ),
          currencyCode:
            text(booking.currency_code) || text(refund.currency_code) || "THB",
        }
      : null,
    customer: customer
      ? {
          userId: customer.userId,
          fullName: customer.fullName,
          phone: customer.phone,
          kycStatus: customer.kycStatus,
        }
      : null,
    cancellation: cancellation
      ? {
          id: text(cancellation.id),
          cancelledAt: text(cancellation.cancelled_at),
          initiator: text(cancellation.cancellation_initiator),
          source: text(cancellation.cancellation_source),
          pickupDateSnapshot: text(cancellation.pickup_date_snapshot),
          refundCutoffDateSnapshot: text(
            cancellation.refund_cutoff_date_snapshot,
          ),
          refundEligible: cancellation.refund_eligible === true,
          refundAmountDue: money(cancellation.refund_amount_due),
        }
      : null,
    proof: proof
      ? {
          id: text(proof.id),
          amount: money(proof.amount),
          paymentMethod: nullable(proof.payment_method),
          fileUrl: text(proof.file_url),
          storageBucket: text(proof.storage_bucket),
          storagePath: text(proof.storage_path),
          mimeType: nullable(proof.mime_type),
          fileSizeBytes: Number(proof.file_size_bytes ?? 0),
          notes: nullable(proof.notes),
          createdAt: text(proof.created_at),
        }
      : null,
    documents: {
      cancellationConfirmation: documentSummary(
        cancellationDocument as Row | null,
      ),
      refundConfirmation: documentSummary(refundDocument as Row | null),
    },
  };
}

export async function listAdminRefunds(
  client: AnyClient,
  input: { status?: unknown; limit?: unknown } = {},
) {
  const status = text(input.status);
  const limit = Math.min(Math.max(Number(input.limit ?? 100) || 100, 1), 200);
  let query = client
    .from("payment_refunds")
    .select(REFUND_SELECT)
    .eq("refund_type", "rental_booking_deposit")
    .order("requested_at", { ascending: false })
    .limit(limit);
  if (status && status !== "all") {
    if (!VALID_STATUSES.has(status))
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid refund status",
      });
    query = query.eq("status", status);
  }
  const { data, error } = await query;
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  return {
    summary: await getAdminRefundSummary(client),
    items: await Promise.all(
      ((data ?? []) as Row[]).map((row) => hydrateRefund(client, row)),
    ),
  };
}

export async function getAdminRefundSummary(client: AnyClient) {
  const summary: Record<(typeof REFUND_STATUSES)[number], number> = {
    pending_admin_review: 0,
    processing: 0,
    needs_customer_contact: 0,
    refunded: 0,
    failed: 0,
  };
  const { data, error } = await client
    .from("payment_refunds")
    .select("status")
    .eq("refund_type", "rental_booking_deposit");
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  for (const row of (data ?? []) as Row[]) {
    const status = text(row.status) as (typeof REFUND_STATUSES)[number];
    if (REFUND_STATUSES.includes(status)) summary[status] += 1;
  }
  return {
    ...summary,
    unresolved_total:
      summary.pending_admin_review +
      summary.processing +
      summary.needs_customer_contact,
  };
}

export async function getAdminRefundDetail(
  client: AnyClient,
  refundId: string,
) {
  return hydrateRefund(client, await loadRefund(client, refundId));
}

export async function issueRefundConfirmationDocument(input: {
  client: AnyClient;
  refundId: string;
  adminUserId: string;
}) {
  const refund = await loadRefund(input.client, input.refundId);
  if (text(refund.status) !== "refunded")
    throw createError({
      statusCode: 409,
      statusMessage: "Refund must be refunded before issuing confirmation",
    });
  if (!text(refund.refund_proof_id))
    throw createError({
      statusCode: 409,
      statusMessage: "Refund proof is required before issuing confirmation",
    });
  await assertRefundProofBelongsToRefund(
    input.client,
    refund,
    text(refund.refund_proof_id),
  );
  const existing = await loadDocumentBySource(
    input.client,
    "payment_refund",
    input.refundId,
    REFUND_DOCUMENT_TYPE,
  );
  if (existing) return { document: existing, alreadyIssued: true };
  if (!input.client.rpc)
    throw createError({
      statusCode: 500,
      statusMessage: "Document numbering unavailable",
    });
  const detail = await hydrateRefund(input.client, refund);
  if (!detail.proof?.id)
    throw createError({
      statusCode: 409,
      statusMessage: "Refund proof is required before issuing confirmation",
    });
  const issuedAt = new Date();
  const { data: documentNo, error: numberError } = await input.client.rpc(
    "f_next_document_number",
    {
      p_document_type: REFUND_DOCUMENT_TYPE,
      p_branch_id: detail.booking?.hubId ?? null,
      p_period: documentPeriod(issuedAt),
      p_prefix: "BDR",
    },
  );
  if (numberError)
    throw createError({ statusCode: 500, statusMessage: numberError.message });
  const snapshot = {
    schema_version: 1,
    document: {
      document_type: REFUND_DOCUMENT_TYPE,
      document_number: String(documentNo),
      issued_at: issuedAt.toISOString(),
      template_key: `${REFUND_DOCUMENT_TYPE}_v1`,
      template_version: 1,
    },
    source: { source_type: "payment_refund", source_id: input.refundId },
    header: await resolveDocumentHeaderSnapshot({
      adminClient: input.client as never,
      branchId: detail.booking?.hubId ?? null,
    }),
    booking: detail.booking,
    cancellation: detail.cancellation,
    refund: {
      id: detail.id,
      status: detail.status,
      amount: detail.refundAmount,
      currency_code: detail.currencyCode,
      refunded_at: detail.refundedAt,
      manual_transfer_reference: detail.manualTransferReference,
      payment_method: detail.proof?.paymentMethod ?? null,
      admin_note: detail.adminNote,
      destination: {
        bank_name: detail.destination.bankName,
        bank_account_name: detail.destination.bankAccountName,
        bank_account_number_masked:
          detail.destination.bankAccountNumber.replace(/.(?=.{4})/g, "•"),
      },
    },
    proof: detail.proof
      ? {
          id: detail.proof.id,
          mime_type: detail.proof.mimeType,
          file_size_bytes: detail.proof.fileSizeBytes,
          created_at: detail.proof.createdAt,
        }
      : null,
    disclaimer: {
      th: "เอกสารยืนยันสถานะการคืนเงิน ไม่ใช่ใบเสร็จรับเงินหรือใบกำกับภาษี",
      en: "Proof of refund completion status. Not an official receipt or tax invoice.",
    },
  };
  const { data, error } = await input.client
    .from("official_documents")
    .insert({
      document_type: REFUND_DOCUMENT_TYPE,
      document_no: String(documentNo),
      status: "issued",
      branch_id: detail.booking?.hubId ?? null,
      source_type: "payment_refund",
      source_id: input.refundId,
      customer_user_id: detail.customer?.userId ?? null,
      issued_at: issuedAt.toISOString(),
      issued_by: input.adminUserId,
      subtotal: 0,
      vat_amount: 0,
      total_amount: detail.refundAmount,
      currency_code: detail.currencyCode,
      template_key: `${REFUND_DOCUMENT_TYPE}_v1`,
      template_version: 1,
      snapshot,
      idempotency_key: `payment_refund:${input.refundId}:${REFUND_DOCUMENT_TYPE}`,
    })
    .select(OFFICIAL_DOCUMENT_SELECT)
    .maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      const doc = await loadDocumentBySource(
        input.client,
        "payment_refund",
        input.refundId,
        REFUND_DOCUMENT_TYPE,
      );
      if (doc) return { document: doc, alreadyIssued: true };
    }
    throw createError({ statusCode: 500, statusMessage: error.message });
  }
  const document = mapOfficialDocumentRow(data as Row);
  await input.client.from("document_events").insert({
    document_id: document.id,
    event_type: "issued",
    staff_user_id: input.adminUserId,
    metadata: {
      sourceType: "payment_refund",
      sourceId: input.refundId,
      documentType: REFUND_DOCUMENT_TYPE,
    },
  });
  return { document, alreadyIssued: false };
}

function mapMarkRefundedRpcError(error: {
  message?: string;
  code?: string;
}): ReturnType<typeof createError> {
  const message = String(error.message ?? "");
  if (
    message.startsWith("REFUND_PROOF_") ||
    message.startsWith("MANUAL_TRANSFER_REFERENCE_REQUIRED") ||
    message.startsWith("REFUND_ACTOR_ROLE_INVALID")
  ) {
    return createError({ statusCode: 422, statusMessage: message });
  }
  if (
    message.startsWith("REFUND_TRANSITION_") ||
    message.startsWith("CANCEL_REFUND_INVARIANT_VIOLATION")
  ) {
    return createError({ statusCode: 409, statusMessage: message });
  }
  if (
    message.startsWith("REFUND_NOT_FOUND") ||
    message.startsWith("BOOKING_NOT_FOUND")
  ) {
    return createError({ statusCode: 404, statusMessage: message });
  }
  console.error("mark-refunded RPC failed:", message);
  return createError({
    statusCode: 500,
    statusMessage: "Refund transition failed",
  });
}

export async function transitionAdminRefund(input: {
  client: AnyClient;
  refundId: string;
  adminUserId: string;
  /** Platform role of the acting admin (from requirePlatformAdmin). */
  actorRole?: string;
  action:
    | "start-processing"
    | "needs-customer-contact"
    | "mark-failed"
    | "mark-refunded";
  adminNote?: unknown;
  manualTransferReference?: unknown;
  refundProofId?: unknown;
}) {
  const refund = await loadRefund(input.client, input.refundId);
  const current = text(refund.status);
  const note = nullable(input.adminNote);
  const now = new Date().toISOString();
  const update: Row = {
    processed_by_user_id: input.adminUserId,
    updated_at: now,
  };
  if (note) update.admin_note = note;
  if (input.action === "start-processing") {
    if (current !== "pending_admin_review")
      throw createError({
        statusCode: 409,
        statusMessage: "Invalid refund transition",
      });
    Object.assign(update, { status: "processing", processing_at: now });
  }
  if (input.action === "needs-customer-contact") {
    if (!["pending_admin_review", "processing"].includes(current) || !note)
      throw createError({
        statusCode: note ? 409 : 422,
        statusMessage: note
          ? "Invalid refund transition"
          : "Admin note is required",
      });
    Object.assign(update, {
      status: "needs_customer_contact",
      needs_customer_contact_at: now,
    });
  }
  if (input.action === "mark-failed") {
    if (
      ![
        "pending_admin_review",
        "processing",
        "needs_customer_contact",
      ].includes(current) ||
      !note
    )
      throw createError({
        statusCode: note ? 409 : 422,
        statusMessage: note
          ? "Invalid refund transition"
          : "Admin note is required",
      });
    Object.assign(update, { status: "failed", failed_at: now });
  }
  if (input.action === "mark-refunded") {
    const ref =
      text(input.manualTransferReference) ||
      text(refund.manual_transfer_reference);
    if (!["pending_admin_review", "processing", "refunded"].includes(current))
      throw createError({
        statusCode: 409,
        statusMessage: "Invalid refund transition",
      });
    if (!ref)
      throw createError({
        statusCode: 422,
        statusMessage: "Manual refund reference is required",
      });
    if (current === "refunded") {
      const document = text(refund.refund_proof_id)
        ? await issueRefundConfirmationDocument({
            client: input.client,
            refundId: input.refundId,
            adminUserId: input.adminUserId,
          })
        : null;
      return {
        detail: await getAdminRefundDetail(input.client, input.refundId),
        document,
      };
    }
    // T3 (design §A case 1, gate 130): mark-refunded money writes live in
    // f_mark_rental_booking_refund_refunded — payment_refunds flip + FULL
    // held-balance ledger release + residue-0 assertion + cancel_refund
    // action-log row in ONE transaction. Evidence before money: a validated
    // refund proof is now REQUIRED (proof-optional behavior removed,
    // ratified at gate 130).
    const proofId = text(input.refundProofId) || text(refund.refund_proof_id);
    if (!proofId)
      throw createError({
        statusCode: 422,
        statusMessage: "Refund proof is required before mark-refunded",
      });
    if (text(input.refundProofId)) {
      await assertRefundProofBelongsToRefund(input.client, refund, proofId);
    }
    if (typeof input.client.rpc !== "function")
      throw createError({
        statusCode: 500,
        statusMessage: "Refund transition failed",
      });
    const { data: rpcData, error: rpcError } = await input.client.rpc(
      "f_mark_rental_booking_refund_refunded",
      {
        p_refund_id: input.refundId,
        p_actor_user_id: input.adminUserId,
        p_actor_role: text(input.actorRole) || "staff",
        p_manual_transfer_reference: ref,
        p_refund_proof_id: proofId,
        p_branch_id: null,
      },
    );
    if (rpcError) throw mapMarkRefundedRpcError(rpcError);
    void rpcData;
    if (note) {
      // Non-money metadata; written after the money transaction commits.
      await input.client
        .from("payment_refunds")
        .update({ admin_note: note, updated_at: now })
        .eq("id", input.refundId);
    }
    const document = await issueRefundConfirmationDocument({
      client: input.client,
      refundId: input.refundId,
      adminUserId: input.adminUserId,
    });
    return {
      detail: await getAdminRefundDetail(input.client, input.refundId),
      document,
    };
  }
  // Non-money transitions (start-processing / needs-customer-contact /
  // mark-failed) stay TS-side; mark-refunded returned above via the RPC.
  const { data, error } = await input.client
    .from("payment_refunds")
    .update(update)
    .eq("id", input.refundId)
    .eq("status", current)
    .select(REFUND_SELECT)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data)
    throw createError({
      statusCode: 409,
      statusMessage: "Invalid refund transition",
    });
  return {
    detail: await getAdminRefundDetail(input.client, input.refundId),
    document: null,
  };
}

export async function linkRefundProof(input: {
  client: AnyClient;
  refundId: string;
  proofId: string;
  adminUserId: string;
}) {
  const refund = await loadRefund(input.client, input.refundId);
  await assertRefundProofBelongsToRefund(input.client, refund, input.proofId);
  const { data, error } = await input.client
    .from("payment_refunds")
    .update({
      refund_proof_id: input.proofId,
      processed_by_user_id: input.adminUserId,
    })
    .eq("id", input.refundId)
    .select(REFUND_SELECT)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (text((data as Row | null)?.status) === "refunded") {
    await issueRefundConfirmationDocument({
      client: input.client,
      refundId: input.refundId,
      adminUserId: input.adminUserId,
    });
  }
  return getAdminRefundDetail(input.client, input.refundId);
}

export { REFUND_DOCUMENT_TYPE };
