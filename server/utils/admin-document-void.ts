/**
 * Document void + reissue wrappers (design §B, T3 walk 7).
 *
 * §F inversion (operation='document_void'): endpoint uses
 * requirePlatformAdmin; the EXPLICIT super_admin check lives here so staff
 * denials are LOGGED before the 403; the ALLOWED row is fail-closed before
 * f_void_official_document (mig 131); correction row on RPC failure.
 *
 * Reissue = the normal issuance mechanics under a FRESH number: clone the
 * voided original's type/source/customer/totals/template/snapshot, take a
 * new number from f_next_document_number, insert with
 * original_document_id = <voided id> + an 'issued' event, then flip the
 * original voided → replaced via f_mark_official_document_replaced (which
 * appends the 'replaced' event carrying the replacement id). Content is
 * reproduced byte-for-byte from the immutable snapshot — edits never (§B).
 * One §F allowed decision (the void) covers the pair: reissue is an
 * issuance, not a destruction.
 */
import { createError } from "h3";
import { asUuidOrNull } from "~~/server/utils/kyc-documents";
import { logMoneyOpsDecision } from "~~/server/utils/money-ops-log";

type Row = Record<string, unknown>;
type AnyClient = {
  from(table: string): any;
  rpc?: (
    name: string,
    params: Row,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

const DOC_SELECT =
  "id, document_type, document_no, status, branch_id, source_type, source_id, original_document_id, tax_profile_id, customer_user_id, walk_in_phone, company_id, subtotal, vat_amount, total_amount, currency_code, template_key, template_version, snapshot, issued_at, issued_by";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function voidOfficialDocument(input: {
  client: AnyClient;
  rawDocumentId: unknown;
  actorUserId: string;
  actorRole: string;
  reason: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const actor = {
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  } as const;

  async function deny(
    denialReason: string,
    statusCode: number,
    statusMessage: string,
    extra: { entityId?: string | null; amount?: number | null } = {},
  ): Promise<never> {
    await logMoneyOpsDecision(input.client, {
      operation: "document_void",
      decision: "denied",
      denialReason,
      entityType: extra.entityId === null ? null : "official_document",
      entityId: extra.entityId ?? null,
      amount: extra.amount ?? null,
      ...actor,
    });
    throw createError({ statusCode, statusMessage });
  }

  const documentId = asUuidOrNull(input.rawDocumentId);
  if (!documentId)
    await deny("malformed_document_id", 404, "Document not found", {
      entityId: null,
    });

  // THE INVERSION: explicit super_admin check, denial logged first.
  if (input.actorRole !== "super_admin")
    await deny("not_super_admin", 403, "Forbidden", { entityId: documentId });

  const reason = text(input.reason);
  if (!reason)
    await deny("reason_required", 422, "Void reason is required", {
      entityId: documentId,
    });

  const { data: doc, error: loadError } = await input.client
    .from("official_documents")
    .select(DOC_SELECT)
    .eq("id", documentId)
    .maybeSingle();
  if (loadError)
    throw createError({ statusCode: 500, statusMessage: loadError.message });
  if (!doc)
    await deny("document_not_found", 404, "Document not found", {
      entityId: documentId,
    });
  const row = doc as Row;
  if (row.status === "voided" || row.status === "replaced") {
    // Idempotent replay (walk-4 pattern): no destruction occurs → no row.
    return { ok: true, alreadyVoided: true, documentId } as Row;
  }
  if (row.status !== "issued" && row.status !== "printed")
    await deny("document_not_voidable", 409, "DOCUMENT_NOT_VOIDABLE", {
      entityId: documentId,
    });

  await logMoneyOpsDecision(
    input.client,
    {
      operation: "document_void",
      decision: "allowed",
      entityType: "official_document",
      entityId: documentId,
      amount: Number(row.total_amount ?? 0) || null,
      currencyCode: text(row.currency_code) || null,
      ...actor,
    },
    { failClosed: true },
  );

  if (typeof input.client.rpc !== "function")
    throw createError({ statusCode: 500, statusMessage: "RPC unavailable" });
  const { data: rpcData, error: rpcError } = await input.client.rpc(
    "f_void_official_document",
    {
      p_document_id: documentId,
      p_actor_user_id: input.actorUserId,
      p_actor_role: input.actorRole,
      p_reason: reason,
    },
  );
  if (rpcError) {
    const message = String(rpcError.message ?? "");
    await logMoneyOpsDecision(input.client, {
      operation: "document_void",
      decision: "denied",
      denialReason: "rpc_failed_after_allow",
      entityType: "official_document",
      entityId: documentId,
      ...actor,
    });
    if (
      message.startsWith("DOCUMENT_NOT_VOIDABLE") ||
      message.startsWith("DOCUMENT_VOID_CONFLICT")
    )
      throw createError({ statusCode: 409, statusMessage: message });
    console.error("document void RPC failed:", message);
    throw createError({ statusCode: 500, statusMessage: "Document void failed" });
  }
  return rpcData as Row;
}

export async function reissueOfficialDocument(input: {
  client: AnyClient;
  rawOriginalDocumentId: unknown;
  actorUserId: string;
}) {
  const originalId = asUuidOrNull(input.rawOriginalDocumentId);
  if (!originalId)
    throw createError({ statusCode: 404, statusMessage: "Document not found" });

  const { data: original, error } = await input.client
    .from("official_documents")
    .select(DOC_SELECT)
    .eq("id", originalId)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (!original)
    throw createError({ statusCode: 404, statusMessage: "Document not found" });
  const row = original as Row;
  if (row.status !== "voided")
    throw createError({
      statusCode: 409,
      statusMessage: `DOCUMENT_NOT_VOIDED: ${String(row.status)}`,
    });

  // Idempotent: an existing replacement linked to this original wins.
  const { data: existing } = await input.client
    .from("official_documents")
    .select("id, document_no, status")
    .eq("original_document_id", originalId)
    .maybeSingle();
  if (existing) {
    return { ok: true, alreadyReissued: true, replacement: existing as Row };
  }

  // Fresh number via the numbering engine — same prefix/period family as the
  // original (prefix derived from its immutable document_no: PREFIX-YYYYMM-NNNN).
  const documentNo = text(row.document_no);
  const prefix = documentNo.split("-")[0] || "DOC";
  const period = new Date().toISOString().slice(0, 7).replace("-", "");
  if (typeof input.client.rpc !== "function")
    throw createError({ statusCode: 500, statusMessage: "RPC unavailable" });
  const { data: newNumber, error: numberError } = await input.client.rpc(
    "f_next_document_number",
    {
      p_document_type: String(row.document_type),
      p_branch_id: (row.branch_id as string) ?? null,
      p_period: period,
      p_prefix: prefix,
    },
  );
  if (numberError || !newNumber)
    throw createError({
      statusCode: 500,
      statusMessage: numberError?.message ?? "Document numbering failed",
    });

  const { data: replacement, error: insertError } = await input.client
    .from("official_documents")
    .insert({
      document_type: row.document_type,
      document_no: String(newNumber),
      status: "issued",
      branch_id: row.branch_id,
      source_type: row.source_type,
      source_id: row.source_id,
      original_document_id: originalId,
      tax_profile_id: row.tax_profile_id,
      customer_user_id: row.customer_user_id,
      walk_in_phone: row.walk_in_phone,
      company_id: row.company_id,
      issued_at: new Date().toISOString(),
      issued_by: input.actorUserId,
      subtotal: row.subtotal,
      vat_amount: row.vat_amount,
      total_amount: row.total_amount,
      currency_code: row.currency_code,
      template_key: row.template_key,
      template_version: row.template_version,
      snapshot: row.snapshot,
      idempotency_key: `reissue-${originalId}`,
    })
    .select(DOC_SELECT)
    .single();
  if (insertError)
    throw createError({ statusCode: 500, statusMessage: insertError.message });

  await input.client.from("document_events").insert({
    document_id: (replacement as Row).id,
    event_type: "issued",
    staff_user_id: input.actorUserId,
    metadata: { reissueOfDocumentId: originalId, reissueOfDocumentNo: documentNo },
  });

  const { error: flipError } = await input.client.rpc(
    "f_mark_official_document_replaced",
    {
      p_original_document_id: originalId,
      p_replacement_document_id: (replacement as Row).id,
      p_actor_user_id: input.actorUserId,
    },
  );
  if (flipError)
    throw createError({ statusCode: 500, statusMessage: flipError.message });

  return { ok: true, alreadyReissued: false, replacement: replacement as Row };
}
