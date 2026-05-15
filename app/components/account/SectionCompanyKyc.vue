<script setup lang="ts">
/**
 * B2B Company KYC — document upload section.
 *
 * Shows list of required B2B documents:
 *  - ภพ.20 (VAT certificate)
 *  - หนังสือรับรอง (Company certificate)
 *  - Bookbank
 *  - ID card of authorized signer
 *  - PDPA consent
 *
 * Uploads through the owner-checked server API, which stores private files and
 * updates companies.kyc_documents with service-role privileges.
 */
import type { KycDocument } from "~/types/user";

const { t } = useI18n();
const toast = useToast();
const { currentCompany, fetchMemberships } = useCompanyContext();

const uploadingDocKey = ref<string | null>(null);
const uploadError = ref<string | null>(null);
const uploadSuccessDoc = ref<string | null>(null);
const uploading = computed(() => uploadingDocKey.value !== null);

// ── Required document types ──
const requiredDocs = computed(() => [
  { key: "vat", label: t("user.docVat") },
  { key: "certificate", label: t("user.docCertificate") },
  { key: "bookbank", label: t("user.docBookbank") },
  { key: "id_card", label: t("user.docIdCard") },
  { key: "pdpa", label: t("user.uploadPdpa") },
]);

// ── KYC status helpers ──
const kycColor = computed(() => {
  const s = currentCompany.value?.kycStatus;
  if (s === "verified") return "success";
  if (s === "rejected") return "error";
  return "warning";
});

const kycLabel = computed(() => {
  const s = currentCompany.value?.kycStatus;
  if (s === "verified") return t("user.kycVerified");
  if (s === "rejected") return t("user.kycRejected");
  return t("user.kycPending");
});

// ── Helper: find existing doc by key ──
function findDoc(key: string): KycDocument | undefined {
  return currentCompany.value?.kycDocuments?.find((d) => d.name === key);
}

function formatFileSize(size?: number) {
  if (!size || size <= 0) return "";
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function documentSummary(doc: KycDocument) {
  const legacyName = doc.url?.split("/").pop();
  if (legacyName) return legacyName;
  return [doc.mimeType, formatFileSize(doc.fileSize)]
    .filter(Boolean)
    .join(" · ");
}

function uploadErrorDescription(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "statusMessage" in error) {
    const message = (error as { statusMessage?: unknown }).statusMessage;
    if (typeof message === "string") return message;
  }
  return undefined;
}

// ── Upload handler per document type ──
async function handleUpload(
  docKey: string,
  file: File | File[] | null | undefined,
) {
  if (!file || Array.isArray(file) || !currentCompany.value) return;

  if (file.size > 5 * 1024 * 1024) {
    toast.add({
      title: t("user.maxFileSize"),
      icon: "bx:error-circle",
      color: "error",
    });
    return;
  }

  uploadingDocKey.value = docKey;
  uploadError.value = null;
  uploadSuccessDoc.value = null;
  try {
    const body = new FormData();
    body.append("companyId", currentCompany.value.id);
    body.append("documentType", docKey);
    body.append("file", file);

    await $fetch("/api/company/kyc/document", {
      method: "POST",
      body,
    });

    await fetchMemberships();
    uploadSuccessDoc.value = docKey;
    toast.add({
      title: t("user.kycUploadSuccess"),
      icon: "bx:check-circle",
      color: "success",
    });
  } catch (e) {
    console.error("Upload error:", e);
    uploadError.value = uploadErrorDescription(e) ?? t("user.saveError");
    toast.add({
      title: t("user.kycUploadError"),
      description: uploadError.value,
      icon: "bx:error-circle",
      color: "error",
    });
  } finally {
    uploadingDocKey.value = null;
  }
}
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">{{ t("user.companyKyc") }}</h2>
          <UBadge
            v-if="currentCompany"
            :label="kycLabel"
            :color="kycColor"
            variant="subtle"
          />
        </div>
      </template>

      <!-- No company -->
      <div v-if="!currentCompany" class="py-8 text-center">
        <UIcon name="bx:file" class="mx-auto mb-2 text-4xl text-muted" />
        <p class="text-muted">{{ t("user.comingSoon") }}</p>
      </div>

      <div v-else class="space-y-6">
        <UAlert
          v-if="uploadError"
          color="error"
          variant="soft"
          icon="bx:error-circle"
          :title="t('user.kycUploadError')"
          :description="uploadError"
        />

        <UAlert
          v-else-if="uploadSuccessDoc"
          color="success"
          variant="soft"
          icon="bx:check-circle"
          :title="t('user.kycUploadSuccess')"
        />

        <!-- Rejection reason -->
        <div
          v-if="
            currentCompany.kycStatus === 'rejected' &&
            currentCompany.kycRejectionReason
          "
          class="rounded-lg border border-error/30 bg-error/5 p-4"
        >
          <p class="text-sm font-medium text-error">
            {{ t("user.rejectionReason") }}
          </p>
          <p class="mt-1 text-sm">{{ currentCompany.kycRejectionReason }}</p>
        </div>

        <!-- Document list -->
        <div
          v-for="doc in requiredDocs"
          :key="doc.key"
          class="rounded-lg border p-4"
        >
          <div class="mb-2 flex items-center justify-between">
            <p class="text-sm font-medium">{{ doc.label }}</p>
            <UBadge
              v-if="findDoc(doc.key)"
              :label="t('user.documentUploaded')"
              color="success"
              variant="subtle"
              size="xs"
            />
          </div>

          <!-- Already uploaded — show file info + re-upload -->
          <div v-if="findDoc(doc.key)" class="space-y-2">
            <div class="flex items-center gap-2 rounded bg-elevated p-2">
              <UIcon name="bx:file" class="text-lg text-muted" />
              <span class="flex-1 truncate text-xs text-muted">
                {{
                  documentSummary(findDoc(doc.key)!) ||
                  t("user.documentUploaded")
                }}
              </span>
            </div>

            <UFileUpload
              v-if="currentCompany.kycStatus !== 'verified'"
              accept="image/jpeg,image/png,application/pdf"
              :label="t('user.reupload')"
              icon="bx:upload"
              variant="area"
              size="sm"
              :dropzone="true"
              :interactive="true"
              :preview="false"
              :disabled="uploading"
              :loading="uploadingDocKey === doc.key"
              @update:model-value="handleUpload(doc.key, $event)"
            />
          </div>

          <!-- No file — upload area -->
          <UFileUpload
            v-else
            accept="image/jpeg,image/png,application/pdf"
            :label="t('user.uploadDocument')"
            :description="t('user.kycFileTypes')"
            icon="bx:upload"
            variant="area"
            size="sm"
            :dropzone="true"
            :interactive="true"
            :preview="false"
            :disabled="uploading"
            :loading="uploadingDocKey === doc.key"
            @update:model-value="handleUpload(doc.key, $event)"
          />
        </div>

        <p class="text-xs text-muted">
          {{ t("user.kycFileTypes") }} · {{ t("user.maxFileSize") }}
        </p>
      </div>
    </UCard>
  </div>
</template>
