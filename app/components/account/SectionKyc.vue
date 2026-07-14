<script setup lang="ts">
/**
 * B2C KYC section — upload ID card + PDPA consent.
 *
 * Features:
 *  - KYC status badge (pending/verified/rejected)
 *  - Rejection reason display
 *  - Detailed PDPA/KYC consent with timestamp
 *  - UFileUpload for ID card via owner-checked server API
 *
 * Reuses:
 *  - useUserProfile() → profile, fetchProfile
 *  - i18n keys: user.*
 */

const { t } = useI18n();
const toast = useToast();
const supabase = useSupabaseClient();
const user = useSupabaseUser();
const { profile, loading, fetchProfile } = useUserProfile();

// ── Consent state ──
const termsAccepted = ref(false);
const pdpaAccepted = ref(false);
const uploading = ref(false);
const savingConsent = ref(false);
// When user presses Edit on a verified KYC
const editingVerified = ref(false);

const consentSections = computed(() => [
  {
    title: t("user.kycConsentDataCollectedTitle"),
    items: [
      t("user.kycConsentDataCollectedIndividual"),
      t("user.kycConsentDataCollectedContact"),
      t("user.kycConsentDataCollectedDocuments"),
      t("user.kycConsentDataCollectedTransactions"),
    ],
  },
  {
    title: t("user.kycConsentPurposeTitle"),
    items: [
      t("user.kycConsentPurposeIdentity"),
      t("user.kycConsentPurposeRisk"),
      t("user.kycConsentPurposeDocuments"),
      t("user.kycConsentPurposeFraud"),
      t("user.kycConsentPurposeLegal"),
    ],
  },
  {
    title: t("user.kycConsentCertificationTitle"),
    items: [
      t("user.kycConsentCertificationTrue"),
      t("user.kycConsentCertificationRights"),
      t("user.kycConsentCertificationNoFraud"),
    ],
  },
  {
    title: t("user.kycConsentDisclosureTitle"),
    items: [
      t("user.kycConsentDisclosureShipping"),
      t("user.kycConsentDisclosurePayment"),
      t("user.kycConsentDisclosureAccounting"),
      t("user.kycConsentDisclosureLegal"),
      t("user.kycConsentDisclosureGovernment"),
    ],
  },
  {
    title: t("user.kycConsentRightsTitle"),
    items: [
      t("user.kycConsentRightsAccess"),
      t("user.kycConsentRightsCorrect"),
      t("user.kycConsentRightsWithdraw"),
      t("user.kycConsentRightsDelete"),
      t("user.kycConsentRightsObject"),
    ],
  },
]);

const hasPdpaConsent = computed(() => Boolean(profile.value?.pdpaConsentedAt));
const isVerified = computed(() => profile.value?.kycStatus === "verified");

// Let customers choose a file on the client; the handler/server blocks upload until PDPA is saved.
const canUploadKycDocument = computed(
  () => Boolean(user.value) && !uploading.value,
);

// Show upload zone:
// - not verified yet, OR
// - verified but user pressed Edit
const showUploadZone = computed(
  () => !isVerified.value || editingVerified.value,
);

// Both checkboxes must be ticked to allow saving consent + uploading
const bothConsentsAccepted = computed(
  () => termsAccepted.value && pdpaAccepted.value,
);

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

async function resolveAuthenticatedUserId(): Promise<string | null> {
  if (isUuid(user.value?.id)) return user.value.id;

  const {
    data: { user: authUser },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;

  return isUuid(authUser?.id) ? authUser.id : null;
}

// Sync PDPA checkbox with profile
watch(
  () => profile.value,
  (p) => {
    if (p?.pdpaConsentedAt) {
      pdpaAccepted.value = true;
      termsAccepted.value = true;
    }
  },
  { immediate: true },
);

// ── KYC status helpers ──
const kycColor = computed(() => {
  const s = profile.value?.kycStatus;
  if (s === "verified") return "success";
  if (s === "rejected") return "error";
  return "warning"; // pending
});

const kycIcon = computed(() => {
  const s = profile.value?.kycStatus;
  if (s === "verified") return "bx:check-circle";
  if (s === "rejected") return "bx:x-circle";
  return "bx:time-five";
});

const kycLabel = computed(() => {
  const s = profile.value?.kycStatus;
  if (s === "verified") return t("user.kycVerified");
  if (s === "rejected") return t("user.kycRejected");
  return t("user.kycPending");
});

// ── §a intake fields (rail-move: kyc_profiles + kyc-profile-documents) ──
const kycIdentityValue = ref("");
const kycHolderName = ref("");

// ── File upload handler ──
async function handleIdCardUpload(file: File | File[] | null | undefined) {
  if (!file || Array.isArray(file) || !user.value) return;

  if (!kycIdentityValue.value.trim() || !kycHolderName.value.trim()) {
    toast.add({
      title: t("user.kycIdentityFieldsRequired"),
      icon: "bx:error-circle",
      color: "warning",
    });
    return;
  }

  if (!hasPdpaConsent.value) {
    toast.add({
      title: t("user.kycConsentRequiredTitle"),
      description: t("user.kycConsentRequiredDesc"),
      icon: "bx:lock",
      color: "warning",
    });
    return;
  }

  // Validate size
  if (file.size > 5 * 1024 * 1024) {
    toast.add({
      title: t("user.maxFileSize"),
      icon: "bx:error-circle",
      color: "error",
    });
    return;
  }

  uploading.value = true;
  try {
    const body = new FormData();
    body.append("file", file);
    body.append("identityValue", kycIdentityValue.value.trim());
    body.append("holderName", kycHolderName.value.trim());

    await $fetch("/api/user/kyc/id-card", {
      method: "POST",
      body,
    });

    await fetchProfile(true);
    toast.add({
      title: t("user.kycUploadSuccess"),
      description: t("user.kycUploadSuccessDesc"),
      icon: "bx:check-circle",
      color: "success",
    });
  } catch (e) {
    console.error("Upload error:", e);
    toast.add({
      title: t("user.kycUploadError"),
      description: e instanceof Error ? e.message : undefined,
      icon: "bx:error-circle",
      color: "error",
    });
  } finally {
    // The raw identity value never stays in component state after a submit.
    kycIdentityValue.value = "";
    uploading.value = false;
  }
}

// ── Edit verified KYC ──
function handleEditVerified() {
  editingVerified.value = true;
}

// ── PDPA consent handler ──
async function handlePdpaConsent() {
  if (!bothConsentsAccepted.value) return;

  savingConsent.value = true;
  try {
    const userId = await resolveAuthenticatedUserId();
    if (!userId) {
      throw new Error("Authentication required");
    }

    const { error: dbErr } = await supabase
      .from("users")
      .update({
        pdpa_consented_at: new Date().toISOString(),
        pdpa_consent_url: "/terms/pdpa",
      })
      .eq("id", userId);

    if (dbErr) throw dbErr;

    await fetchProfile(true);
    toast.add({
      title: t("user.kycConsentSaveSuccess"),
      icon: "bx:check-circle",
      color: "success",
    });
  } catch (e) {
    toast.add({
      title: t("user.kycConsentSaveError"),
      description: e instanceof Error ? e.message : undefined,
      icon: "bx:error-circle",
      color: "error",
    });
  } finally {
    savingConsent.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- KYC Status Card -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">{{ t("user.kyc") }}</h2>
          <UBadge
            :color="kycColor"
            :icon="kycIcon"
            :label="kycLabel"
            variant="subtle"
          />
        </div>
      </template>

      <!-- Loading -->
      <div v-if="loading" class="space-y-4">
        <div
          v-for="i in 3"
          :key="i"
          class="h-10 animate-pulse rounded bg-elevated"
        />
      </div>

      <div v-else class="space-y-6">
        <!-- Rejection reason -->
        <div
          v-if="profile?.kycStatus === 'rejected' && profile.kycRejectionReason"
          class="rounded-lg border border-error/30 bg-error/5 p-4"
        >
          <p class="text-sm font-medium text-error">
            {{ t("user.rejectionReason") }}
          </p>
          <p class="mt-1 text-sm">{{ profile.kycRejectionReason }}</p>
        </div>

        <!-- ID Card Upload -->
        <div>
          <div class="mb-2 flex items-center justify-between gap-3">
            <p class="text-sm font-medium">{{ t("user.uploadIdCard") }}</p>
            <!-- Edit button when verified -->
            <UButton
              v-if="isVerified && !editingVerified"
              icon="bx:edit"
              size="xs"
              color="neutral"
              variant="ghost"
              :label="t('user.edit')"
              @click="handleEditVerified"
            />
          </div>

          <!-- Verified state — show document preview + Edit warning -->
          <div v-if="isVerified && !editingVerified" class="space-y-3">
            <div v-if="profile?.idCardUrl" class="space-y-2">
              <!-- Image preview if applicable -->
              <div
                v-if="/\.(jpe?g|png|webp)$/i.test(profile.idCardUrl)"
                class="overflow-hidden rounded-lg border"
              >
                <img
                  :src="profile.idCardUrl"
                  alt="ID Card"
                  class="max-h-48 w-full object-contain"
                />
              </div>
              <div class="flex items-center gap-3 rounded-lg border p-3">
                <UIcon name="bx:id-card" class="text-2xl text-muted" />
                <div class="flex-1 truncate text-sm">
                  {{ profile.idCardUrl.split("/").pop() }}
                </div>
                <UBadge
                  color="success"
                  variant="subtle"
                  :label="t('user.kycVerified')"
                />
              </div>
            </div>
            <p class="text-xs text-muted">
              {{ t("user.kycVerifiedEditHint") }}
            </p>
          </div>

          <!-- Edit warning when pressing Edit on verified -->
          <UAlert
            v-if="isVerified && editingVerified"
            class="mb-3"
            color="warning"
            variant="soft"
            icon="bx:error"
            :title="t('user.kycEditWarningTitle')"
            :description="t('user.kycEditWarningDesc')"
          />

          <!-- Upload zone — shown when not yet verified or user pressed Edit -->
          <div v-if="showUploadZone" class="space-y-3">
            <p class="text-xs text-muted">
              {{ t("user.kycFileTypes") }} · {{ t("user.maxFileSize") }}
            </p>
            <p class="text-xs font-medium text-warning">
              {{ t("user.kycIdCardPurposeNote") }}
            </p>

            <!-- §a intake: name-on-ID + ID number (hashed server-side) -->
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField :label="t('user.kycHolderNameLabel')">
                <UInput
                  v-model="kycHolderName"
                  :placeholder="t('user.kycHolderNamePlaceholder')"
                  autocomplete="off"
                />
              </UFormField>
              <UFormField
                :label="t('user.kycIdNumberLabel')"
                :hint="t('user.kycIdNumberHint')"
              >
                <UInput
                  v-model="kycIdentityValue"
                  :placeholder="t('user.kycIdNumberPlaceholder')"
                  autocomplete="off"
                />
              </UFormField>
            </div>

            <!-- Already uploaded — show re-upload -->
            <div v-if="profile?.idCardUrl" class="space-y-3">
              <div class="flex items-center gap-3 rounded-lg border p-3">
                <UIcon name="bx:id-card" class="text-2xl text-muted" />
                <div class="flex-1 truncate text-sm">
                  {{ profile.idCardUrl.split("/").pop() }}
                </div>
                <UBadge color="neutral" variant="subtle" label="Uploaded" />
              </div>
              <UFileUpload
                accept="image/jpeg,image/png,application/pdf"
                :label="t('user.reupload')"
                :description="t('user.kycFileTypes')"
                icon="bx:upload"
                variant="area"
                size="sm"
                :dropzone="true"
                :interactive="true"
                :preview="false"
                :disabled="!canUploadKycDocument"
                @update:model-value="handleIdCardUpload"
              />
            </div>

            <!-- No file yet -->
            <UFileUpload
              v-if="!profile?.idCardUrl"
              accept="image/jpeg,image/png,application/pdf"
              :label="t('user.uploadIdCard')"
              :description="t('user.kycFileTypes')"
              icon="bx:upload"
              variant="area"
              :dropzone="true"
              :interactive="true"
              :preview="false"
              :disabled="!canUploadKycDocument"
              class="min-h-40"
              @update:model-value="handleIdCardUpload"
            />
          </div>

          <UAlert
            v-if="!hasPdpaConsent"
            class="mt-3"
            color="warning"
            variant="soft"
            icon="bx:lock"
            :title="t('user.kycConsentRequiredTitle')"
            :description="t('user.kycConsentRequiredDesc')"
          />

          <UAlert
            v-if="uploading"
            class="mt-3"
            color="info"
            variant="soft"
            icon="bx:loader-alt"
            :title="t('user.kycUploadInProgressTitle')"
            :description="t('user.kycUploadInProgressDesc')"
          />
        </div>

        <!-- PDPA / KYC Consent -->
        <div class="rounded-lg border p-4">
          <div class="mb-3 flex items-start justify-between gap-3">
            <div>
              <p class="text-sm font-medium">
                {{ t("user.kycConsentFullTitle") }}
              </p>
              <p class="mt-1 text-xs text-muted">
                {{ t("user.kycConsentFullSubtitle") }}
              </p>
            </div>
            <UBadge
              v-if="profile?.pdpaConsentedAt"
              color="success"
              variant="subtle"
              :label="t('user.verified')"
            />
          </div>

          <div
            class="mb-4 max-h-96 space-y-4 overflow-y-auto rounded-lg border bg-elevated/30 p-4 text-sm"
          >
            <p class="text-muted">{{ t("user.kycConsentFullIntro") }}</p>
            <div
              v-for="section in consentSections"
              :key="section.title"
              class="space-y-2"
            >
              <h3 class="font-semibold">{{ section.title }}</h3>
              <ul class="list-disc space-y-1 ps-5 text-muted">
                <li v-for="item in section.items" :key="item">{{ item }}</li>
              </ul>
            </div>
            <div class="rounded-lg bg-primary/5 p-3 text-default">
              {{ t("user.kycConsentRetentionDesc") }}
            </div>
            <p class="font-medium">{{ t("user.kycConsentAcceptanceText") }}</p>
          </div>

          <!-- Already consented -->
          <div
            v-if="profile?.pdpaConsentedAt"
            class="flex items-center gap-2 text-sm text-success"
          >
            <UIcon name="bx:check-circle" class="text-lg" />
            <span>{{ t("user.kycConsentAcceptanceText") }}</span>
            <UBadge
              color="success"
              variant="subtle"
              size="xs"
              label="✓"
              class="ml-auto"
            />
          </div>

          <!-- Not yet consented -->
          <div v-else class="space-y-3">
            <!-- Checkbox 1: Term of agreement -->
            <UCheckbox
              v-model="termsAccepted"
              :label="t('user.kycTermsCheckbox')"
            />
            <!-- Checkbox 2: PDPA -->
            <UCheckbox
              v-model="pdpaAccepted"
              :label="t('user.kycConsentCheckboxDetailed')"
            />

            <UButton
              :label="t('user.pdpaConsent')"
              icon="bx:check"
              color="primary"
              :disabled="!bothConsentsAccepted || savingConsent || uploading"
              :loading="savingConsent"
              @click="handlePdpaConsent"
            />
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
