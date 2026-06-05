<script setup lang="ts">
/**
 * Admin KYC Documents Panel v1 (staging).
 *
 * List / upload / download KYC documents for one KYC profile through the
 * existing server APIs ONLY:
 *   GET  /api/admin/kyc/profiles/:id/documents   (safe metadata list)
 *   POST /api/admin/kyc/profiles/:id/documents   (staff intake upload)
 *   GET  /api/admin/kyc/documents/:id/download   (super_admin server-proxy)
 *
 * SECURITY CONTRACT (pinned by tests/server/admin-kyc-documents-panel-ui.spec.ts):
 *  - Renders SAFE metadata only — never storage paths, bucket names, signed or
 *    public URLs, or raw identity values (the APIs never return them).
 *  - No inline preview of document bytes in any form. Download only.
 *  - The Download button is rendered for super_admin only (UX gating — the
 *    server stays authoritative and a mid-session role drift still gets a
 *    clean 403 toast).
 *  - Download bytes are handled as a transient blob: object URL created,
 *    anchor clicked, then revoked on next tick (synchronous revoke can cancel
 *    the download in some browsers).
 *  - Filename comes from the server Content-Disposition header only — never
 *    built from customer/profile fields.
 *  - This component never writes audit logs; the endpoints own all logging.
 */
import type { AdminKycDocument, AdminKycProfile } from "~/types/admin-kyc";

const props = defineProps<{ profile: AdminKycProfile }>();

const toast = useToast();
const { profile: viewerProfile } = useUserProfile();

const isSuperAdmin = computed(
  () => viewerProfile.value?.platformRole === "super_admin",
);

// ── Document type coherence (mirror of the upload endpoint map; server enforces) ──
const DOCUMENT_TYPES_BY_PROFILE: Record<string, string[]> = {
  "individual|national_id": ["id_card", "signature"],
  "individual|passport": ["passport", "signature"],
  "company|juristic_id": ["company_cert", "vat_certificate", "signature"],
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  id_card: "ID card",
  passport: "Passport",
  company_cert: "Company certificate",
  vat_certificate: "VAT certificate",
  signature: "Signature",
};

const MAX_FILE_BYTES = 10 * 1024 * 1024; // mirror of the server 10 MB hard cap

const allowedDocumentTypes = computed(
  () =>
    DOCUMENT_TYPES_BY_PROFILE[
      `${props.profile.customerType}|${props.profile.identityType}`
    ] ?? [],
);

const typeOptions = computed(() =>
  allowedDocumentTypes.value.map((value) => ({
    value,
    label: DOCUMENT_TYPE_LABELS[value] ?? value,
  })),
);

// ── List ─────────────────────────────────────────────────────────────────────
const documents = ref<AdminKycDocument[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);

async function loadDocuments() {
  loading.value = true;
  loadError.value = null;
  try {
    const res = await $fetch<{ documents: AdminKycDocument[] }>(
      `/api/admin/kyc/profiles/${props.profile.id}/documents`,
    );
    documents.value = res.documents;
  } catch (e) {
    loadError.value = readableError(e, "Failed to load documents");
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.profile.id,
  () => {
    documents.value = [];
    void loadDocuments();
  },
  { immediate: true },
);

// ── Upload ───────────────────────────────────────────────────────────────────
const showUpload = ref(false);
const busy = ref(false);
const upload = reactive({
  file: null as File | null,
  documentType: "",
  issuedAt: "",
  expiresAt: "",
});

const issuedAtRequired = computed(() => upload.documentType === "company_cert");

const canSubmitUpload = computed(
  () =>
    !!upload.file &&
    !!upload.documentType &&
    (!issuedAtRequired.value || !!upload.issuedAt),
);

function resetUpload() {
  upload.file = null;
  upload.documentType = "";
  upload.issuedAt = "";
  upload.expiresAt = "";
}

function onFileChange(e: Event) {
  const t = e.target as HTMLInputElement;
  upload.file = t.files?.[0] ?? null;
}

async function submitUpload() {
  if (busy.value || !canSubmitUpload.value || !upload.file) return;
  if (upload.file.size > MAX_FILE_BYTES) {
    toast.add({
      title: "File too large",
      description: "KYC documents are limited to 10 MB.",
      color: "error",
      icon: "bx:error-circle",
    });
    return;
  }
  busy.value = true;
  try {
    const fd = new FormData();
    fd.append("file", upload.file);
    fd.append("documentType", upload.documentType);
    if (upload.issuedAt) fd.append("issuedAt", upload.issuedAt);
    if (upload.expiresAt) fd.append("expiresAt", upload.expiresAt);

    await $fetch(`/api/admin/kyc/profiles/${props.profile.id}/documents`, {
      method: "POST",
      body: fd,
    });
    toast.add({
      title: "Document uploaded",
      color: "success",
      icon: "bx:check-circle",
    });
    showUpload.value = false;
    resetUpload();
    await loadDocuments();
  } catch (e) {
    toast.add({
      title: "Upload failed",
      description: readableError(e, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    busy.value = false;
  }
}

// ── Download (super_admin only; server-proxy attachment) ────────────────────
const downloadingId = ref<string | null>(null);

async function downloadDocument(doc: AdminKycDocument) {
  if (downloadingId.value) return;
  downloadingId.value = doc.id;
  try {
    const response = await fetch(
      `/api/admin/kyc/documents/${doc.id}/download`,
    );
    if (!response.ok) {
      toast.add({
        title: "Download failed",
        description: downloadErrorMessage(response.status),
        color: "error",
        icon: "bx:error-circle",
      });
      return;
    }
    const blob = await response.blob();
    const filename =
      filenameFromContentDisposition(
        response.headers.get("content-disposition"),
      ) ?? `kyc-${doc.id}`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Next-tick revoke — a synchronous revoke can cancel the download in
    // some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch {
    toast.add({
      title: "Download failed",
      description: "Network error while downloading the document.",
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    downloadingId.value = null;
  }
}

/** Server Content-Disposition is the ONLY filename source (opaque kyc-<id>.<ext>). */
function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="([^"]+)"/.exec(header);
  return match?.[1] ?? null;
}

function downloadErrorMessage(status: number): string {
  if (status === 403) return "Super admin access required.";
  if (status === 404) return "Document not found.";
  return "The server could not deliver the document. Try again or check server logs.";
}

// ── Formatting helpers ───────────────────────────────────────────────────────
function readableError(e: unknown, fallback: string): string {
  const err = e as {
    data?: { statusMessage?: string };
    statusMessage?: string;
    message?: string;
  };
  return err?.data?.statusMessage ?? err?.statusMessage ?? err?.message ?? fallback;
}

function mimeLabel(mime: string | null): string {
  if (mime === "image/jpeg") return "JPEG";
  if (mime === "image/png") return "PNG";
  if (mime === "application/pdf") return "PDF";
  return mime ?? "—";
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="font-semibold">KYC documents ({{ documents.length }})</h3>
        <UButton
          size="xs"
          icon="bx:upload"
          label="Upload"
          color="primary"
          variant="soft"
          :disabled="typeOptions.length === 0"
          :loading="busy"
          @click="showUpload = true"
        />
      </div>
    </template>

    <p v-if="loadError" class="py-4 text-center text-sm text-error">
      {{ loadError }}
    </p>
    <p
      v-else-if="loading && documents.length === 0"
      class="py-4 text-center text-sm italic text-muted"
    >
      Loading documents…
    </p>
    <p
      v-else-if="documents.length === 0"
      class="py-4 text-center text-sm italic text-muted"
    >
      No documents on file for this profile.
    </p>

    <ul v-else class="space-y-2">
      <li
        v-for="d in documents"
        :key="d.id"
        class="flex flex-wrap items-start gap-3 rounded-lg border border-default p-3"
      >
        <UIcon
          :name="
            d.mimeType?.startsWith('image/') ? 'bx:image' : 'bx:file-blank'
          "
          class="mt-1 text-2xl text-muted"
        />
        <div class="min-w-0 flex-1 space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium">
              {{ DOCUMENT_TYPE_LABELS[d.documentType] ?? d.documentType }}
            </span>
            <UBadge color="neutral" variant="soft" size="xs">
              {{ mimeLabel(d.mimeType) }}
            </UBadge>
          </div>
          <p class="text-xs text-muted">
            {{ formatBytes(d.fileSizeBytes) }} · uploaded
            {{ formatDate(d.uploadedAt) }}
          </p>
        </div>
        <UButton
          v-if="isSuperAdmin"
          size="xs"
          variant="soft"
          color="primary"
          icon="bx:download"
          label="Download"
          :loading="downloadingId === d.id"
          @click="void downloadDocument(d)"
        />
      </li>
    </ul>

    <UModal v-model:open="showUpload" title="Upload KYC document">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Document type">
            <USelect
              v-model="upload.documentType"
              :items="typeOptions"
              placeholder="Select type"
            />
          </UFormField>
          <UFormField label="File" hint="JPEG, PNG or PDF — up to 10 MB">
            <input
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              class="block w-full text-sm"
              @change="onFileChange"
            />
          </UFormField>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField
              :label="issuedAtRequired ? 'Issued at (required)' : 'Issued at (optional)'"
              hint="Must not be in the future"
            >
              <UInput v-model="upload.issuedAt" type="date" />
            </UFormField>
            <UFormField
              label="Expires at (optional)"
              hint="Not earlier than issued at"
            >
              <UInput v-model="upload.expiresAt" type="date" />
            </UFormField>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            :disabled="busy"
            @click="showUpload = false"
          />
          <UButton
            label="Upload"
            color="primary"
            :loading="busy"
            :disabled="busy || !canSubmitUpload"
            @click="void submitUpload()"
          />
        </div>
      </template>
    </UModal>
  </UCard>
</template>
