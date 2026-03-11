<script setup lang="ts">
/**
 * B2C KYC section — upload ID card + PDPA consent.
 *
 * Features:
 *  - KYC status badge (pending/verified/rejected)
 *  - Rejection reason display
 *  - PDPA consent checkbox with timestamp
 *  - UFileUpload for ID card (jpeg/png/pdf, max 5MB)
 *
 * Reuses:
 *  - useUserProfile() → profile, fetchProfile
 *  - useSupabaseClient() → storage upload + users table update
 *  - i18n keys: user.*
 */

const { t } = useI18n();
const toast = useToast();
const supabase = useSupabaseClient();
const user = useSupabaseUser();
const { profile, loading, fetchProfile } = useUserProfile();

// ── PDPA consent state ──
const pdpaAccepted = ref(false);
const uploading = ref(false);

// Sync PDPA checkbox with profile
watch(
  () => profile.value,
  (p) => {
    if (p?.pdpaConsentedAt) pdpaAccepted.value = true;
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

// ── File upload handler ──
async function handleIdCardUpload(file: File | File[] | null | undefined) {
  if (!file || Array.isArray(file) || !user.value) return;

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
    const ext = file.name.split(".").pop() || "jpg";
    const path = `kyc/${user.value.id}/id-card.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("kyc-documents")
      .upload(path, file, { upsert: true });

    if (uploadErr) throw uploadErr;

    const { data: urlData } = supabase.storage
      .from("kyc-documents")
      .getPublicUrl(path);

    // Update user record
    const { error: dbErr } = await supabase
      .from("users")
      .update({ id_card_url: urlData.publicUrl })
      .eq("id", user.value.id);

    if (dbErr) throw dbErr;

    await fetchProfile();
    toast.add({
      title: t("user.saveSuccess"),
      icon: "bx:check-circle",
      color: "success",
    });
  } catch (e) {
    console.error("Upload error:", e);
    toast.add({
      title: t("user.saveError"),
      icon: "bx:error-circle",
      color: "error",
    });
  } finally {
    uploading.value = false;
  }
}

// ── PDPA consent handler ──
async function handlePdpaConsent() {
  if (!user.value || !pdpaAccepted.value) return;

  uploading.value = true;
  try {
    const { error: dbErr } = await supabase
      .from("users")
      .update({
        pdpa_consented_at: new Date().toISOString(),
        pdpa_consent_url: "/terms/pdpa",
      })
      .eq("id", user.value.id);

    if (dbErr) throw dbErr;

    await fetchProfile();
    toast.add({
      title: t("user.saveSuccess"),
      icon: "bx:check-circle",
      color: "success",
    });
  } catch {
    toast.add({
      title: t("user.saveError"),
      icon: "bx:error-circle",
      color: "error",
    });
  } finally {
    uploading.value = false;
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
          <p class="mb-2 text-sm font-medium">{{ t("user.uploadIdCard") }}</p>
          <p class="mb-3 text-xs text-muted">
            {{ t("user.kycFileTypes") }} · {{ t("user.maxFileSize") }}
          </p>

          <!-- Already uploaded — show preview -->
          <div v-if="profile?.idCardUrl" class="space-y-3">
            <div class="flex items-center gap-3 rounded-lg border p-3">
              <UIcon name="bx:id-card" class="text-2xl text-muted" />
              <div class="flex-1 truncate text-sm">
                {{ profile.idCardUrl.split("/").pop() }}
              </div>
              <UBadge color="success" variant="subtle" label="Uploaded" />
            </div>

            <!-- Re-upload button (when rejected or wants to replace) -->
            <UFileUpload
              v-if="profile.kycStatus !== 'verified'"
              accept="image/jpeg,image/png,application/pdf"
              :label="t('user.reupload')"
              :description="t('user.kycFileTypes')"
              icon="bx:upload"
              variant="area"
              size="sm"
              :dropzone="true"
              :interactive="true"
              :preview="false"
              :disabled="uploading"
              @update:model-value="handleIdCardUpload"
            />
          </div>

          <!-- No file yet — show full upload area -->
          <UFileUpload
            v-else
            accept="image/jpeg,image/png,application/pdf"
            :label="t('user.uploadIdCard')"
            :description="t('user.kycFileTypes')"
            icon="bx:upload"
            variant="area"
            :dropzone="true"
            :interactive="true"
            :preview="false"
            :disabled="uploading"
            class="min-h-40"
            @update:model-value="handleIdCardUpload"
          />
        </div>

        <!-- PDPA Consent -->
        <div class="rounded-lg border p-4">
          <p class="mb-3 text-sm font-medium">{{ t("user.pdpaConsent") }}</p>

          <!-- Already consented -->
          <div
            v-if="profile?.pdpaConsentedAt"
            class="flex items-center gap-2 text-sm text-success"
          >
            <UIcon name="bx:check-circle" class="text-lg" />
            <span>{{ t("user.pdpaCheckbox") }}</span>
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
            <label class="flex cursor-pointer items-start gap-2">
              <input
                v-model="pdpaAccepted"
                type="checkbox"
                class="mt-0.5 h-4 w-4 rounded border-gray-300"
              />
              <span class="text-sm">{{ t("user.pdpaCheckbox") }}</span>
            </label>

            <UButton
              :label="t('user.pdpaConsent')"
              icon="bx:check"
              color="primary"
              :disabled="!pdpaAccepted || uploading"
              :loading="uploading"
              @click="handlePdpaConsent"
            />
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
