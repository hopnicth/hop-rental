import { createError, defineEventHandler, readMultipartFormData } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getAuthUserId } from "~~/server/utils/user-wishlist";

const KYC_DOCUMENTS_BUCKET = "kyc-documents";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "application/pdf"]);
const ALLOWED_DOCUMENT_TYPES = new Set([
  "vat",
  "certificate",
  "bookbank",
  "id_card",
  "pdpa",
]);

type MultipartPart = {
  name?: string;
  filename?: string;
  type?: string;
  data?: Uint8Array;
};

type KycDocumentMetadata = {
  name: string;
  uploadedAt: string;
  mimeType?: string;
  fileSize?: number;
  url?: string;
};

type QueryResult = {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
};

type MutationResult = {
  error: { message: string } | null;
};

type MutationBuilder = {
  eq(column: string, value: unknown): Promise<MutationResult>;
};

type QueryBuilder = {
  select(columns: string): QueryBuilder;
  update(payload: Record<string, unknown>): MutationBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  maybeSingle(): Promise<QueryResult>;
};

type CompanyKycClient = {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        buffer: Buffer,
        options: Record<string, unknown>,
      ): Promise<MutationResult>;
    };
  };
  from(table: "company_members" | "companies"): QueryBuilder;
};

function readTextPart(parts: MultipartPart[] | undefined, name: string) {
  const part = parts?.find((item) => item.name === name && item.data);
  return part?.data ? Buffer.from(part.data).toString("utf8").trim() : "";
}

function findFilePart(parts: MultipartPart[] | undefined) {
  return (
    parts?.find((part) => part.name === "file" && part.filename && part.data) ??
    parts?.find((part) => part.filename && part.data)
  );
}

function normalizeExistingDocuments(value: unknown): KycDocumentMetadata[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.name !== "string" || row.name.length === 0) return [];
    return [row as KycDocumentMetadata];
  });
}

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = getAuthUserId(authUser);
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const parts = (await readMultipartFormData(event)) as
    | MultipartPart[]
    | undefined;
  const companyId = readTextPart(parts, "companyId");
  const documentType = readTextPart(parts, "documentType");
  const file = findFilePart(parts);

  if (!companyId) {
    throw createError({
      statusCode: 400,
      statusMessage: "companyId is required",
    });
  }
  if (!ALLOWED_DOCUMENT_TYPES.has(documentType)) {
    throw createError({
      statusCode: 422,
      statusMessage: "Unsupported company KYC document type",
    });
  }
  if (!file?.data) {
    throw createError({
      statusCode: 400,
      statusMessage: "Company KYC document file is required",
    });
  }
  if (!ALLOWED_MIME.has(file.type || "")) {
    throw createError({
      statusCode: 415,
      statusMessage: "Only JPEG, PNG, or PDF files are supported",
    });
  }

  const buffer = Buffer.from(file.data);
  if (buffer.byteLength > MAX_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: "Company KYC document must be 5MB or smaller",
    });
  }

  const client = serverSupabaseServiceRole(
    event,
  ) as unknown as CompanyKycClient;
  const { data: membership, error: membershipError } = await client
    .from("company_members")
    .select("id, role")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (membershipError) {
    throw createError({
      statusCode: 500,
      statusMessage: membershipError.message,
    });
  }
  if (!membership) {
    throw createError({
      statusCode: 403,
      statusMessage: "Company membership required",
    });
  }
  if (membership.role !== "b2b_admin") {
    throw createError({
      statusCode: 403,
      statusMessage: "Company admin access required",
    });
  }

  const { data: company, error: companyError } = await client
    .from("companies")
    .select("id, kyc_documents")
    .eq("id", companyId)
    .maybeSingle();

  if (companyError) {
    throw createError({ statusCode: 500, statusMessage: companyError.message });
  }
  if (!company) {
    throw createError({ statusCode: 404, statusMessage: "Company not found" });
  }

  const storagePath = `company-kyc/${companyId}/${documentType}`;
  const { error: uploadError } = await client.storage
    .from(KYC_DOCUMENTS_BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    throw createError({ statusCode: 500, statusMessage: uploadError.message });
  }

  const documentMetadata: KycDocumentMetadata = {
    name: documentType,
    uploadedAt: new Date().toISOString(),
    mimeType: file.type,
    fileSize: buffer.byteLength,
  };
  const nextDocuments = normalizeExistingDocuments(company.kyc_documents)
    .filter((item) => item.name !== documentType)
    .concat(documentMetadata);

  const { error: updateError } = await client
    .from("companies")
    .update({ kyc_documents: nextDocuments })
    .eq("id", companyId);

  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: updateError.message });
  }

  return {
    document: documentMetadata,
    file: {
      storageBucket: KYC_DOCUMENTS_BUCKET,
      mimeType: file.type,
      fileSize: buffer.byteLength,
    },
  };
});
