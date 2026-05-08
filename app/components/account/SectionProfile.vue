<script setup lang="ts">
/**
 * Profile section — ALL roles can access.
 *
 * Displays and allows editing of:
 *  - Full name, Phone, Avatar URL (read-only), Email (read-only), Member since
 *  - Membership level badge
 *
 * Reuses:
 *  - useUserProfile() → profile, updateProfile, loading
 *  - useAuthSession() → userEmail
 *  - i18n keys: user.*
 */
import QrcodeVue from "qrcode.vue";

const { t, locale } = useI18n();
const toast = useToast();
const { profile, updateProfile, loading } = useUserProfile();
const { userEmail } = useAuthSession();
const isCustomerQrOpen = ref(false);
const customerQrPayload = computed(() =>
  profile.value?.id ? `customer:${profile.value.id}` : "",
);

// ── Editable form state ──
const fullName = ref("");
const phone = ref("");

// Sync form with profile when it loads
watch(
  () => profile.value,
  (p) => {
    if (p) {
      fullName.value = p.fullName ?? "";
      phone.value = p.phone ?? "";
    }
  },
  { immediate: true },
);

// ── Save handler ──
const saving = ref(false);

async function handleSave() {
  saving.value = true;
  const ok = await updateProfile({
    fullName: fullName.value || null,
    phone: phone.value || null,
  });
  saving.value = false;

  if (ok) {
    toast.add({
      title: t("user.saveSuccess"),
      icon: "bx:check-circle",
      color: "success",
    });
  } else {
    toast.add({
      title: t("user.saveError"),
      icon: "bx:error-circle",
      color: "error",
    });
  }
}

// ── Format date ──
function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(locale.value, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ── Check if form has changes ──
const hasChanges = computed(() => {
  if (!profile.value) return false;
  return (
    fullName.value !== (profile.value.fullName ?? "") ||
    phone.value !== (profile.value.phone ?? "")
  );
});

// ── Membership badge color ──
const membershipColor = computed(() => {
  const level = profile.value?.membershipLevel;
  if (level === "gold") return "warning";
  if (level === "silver") return "neutral";
  return "info"; // bronze
});
</script>

<template>
  <div class="space-y-4">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">{{ t("user.personalInfo") }}</h2>
          <UBadge
            v-if="profile?.membershipLevel"
            :color="membershipColor"
            variant="subtle"
            :label="
              t(
                `user.member${profile.membershipLevel.charAt(0).toUpperCase() + profile.membershipLevel.slice(1)}`,
              )
            "
            icon="bx:medal"
          />
        </div>
      </template>

      <!-- Loading skeleton -->
      <div v-if="loading" class="space-y-4">
        <div
          v-for="i in 4"
          :key="i"
          class="h-10 animate-pulse rounded bg-elevated"
        />
      </div>

      <!-- Profile form -->
      <form v-else class="space-y-5" @submit.prevent="handleSave">
        <!-- Full Name -->
        <div>
          <label class="mb-1 block text-sm font-medium">{{
            t("user.fullName")
          }}</label>
          <UInput
            v-model="fullName"
            icon="bx:user"
            :placeholder="t('user.fullName')"
            size="lg"
          />
        </div>

        <!-- Phone -->
        <div>
          <label class="mb-1 block text-sm font-medium">{{
            t("user.phone")
          }}</label>
          <UInput
            v-model="phone"
            icon="bx:phone"
            :placeholder="t('user.phone')"
            size="lg"
          />
        </div>

        <!-- Email (read-only) -->
        <div>
          <label class="mb-1 block text-sm font-medium">{{
            t("user.email")
          }}</label>
          <UInput
            :model-value="userEmail"
            icon="bx:envelope"
            disabled
            size="lg"
          />
        </div>

        <!-- Member Since (read-only) -->
        <div>
          <label class="mb-1 block text-sm font-medium">{{
            t("user.memberSince")
          }}</label>
          <p class="text-sm text-muted">
            {{ formatDate(profile?.createdAt) }}
          </p>
        </div>

        <!-- Save button -->
        <UButton
          type="submit"
          :label="saving ? t('user.saving') : t('user.saveChanges')"
          :loading="saving"
          :disabled="!hasChanges || saving"
          icon="bx:save"
          size="lg"
        />
      </form>
    </UCard>

    <UCard v-if="profile">
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold">Customer QR</h2>
            <p class="text-sm text-muted">
              แสดง QR นี้ให้พนักงานสแกนเมื่อต้องทำ Walk-in หรือรับ/คืนสินค้า
            </p>
          </div>
          <UButton
            icon="bx:qr"
            label="แสดง QR"
            color="primary"
            variant="soft"
            @click="isCustomerQrOpen = true"
          />
        </div>
      </template>
      <p class="text-xs text-muted">
        Payload: <span class="font-mono">{{ customerQrPayload }}</span>
      </p>
    </UCard>

    <UModal v-model:open="isCustomerQrOpen" title="Customer QR">
      <template #body>
        <div class="flex flex-col items-center gap-4 py-2">
          <div class="rounded-xl border bg-white p-4">
            <QrcodeVue :value="customerQrPayload" :size="220" level="H" />
          </div>
          <div class="text-center text-sm">
            <p class="font-semibold">{{ profile.fullName || userEmail }}</p>
            <p class="text-xs text-muted">{{ profile.phone || profile.id }}</p>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
