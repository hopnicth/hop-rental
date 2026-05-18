<script setup lang="ts">
/**
 * Profile section — ALL roles can access.
 *
 * Displays and allows editing of:
 *  - First name, Last name, Phone, Avatar upload/delete, Email (read-only), Member since
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
const authUser = useSupabaseUser();
const isCustomerQrOpen = ref(false);
const customerQrPayload = computed(() =>
  profile.value?.id ? `customer:${profile.value.id}` : "",
);
const authPhone = computed(() => {
  const value = (authUser.value as { phone?: unknown } | null)?.phone;
  return typeof value === "string" ? value : "";
});
const isMobileVerified = computed(() =>
  Boolean(
    (authUser.value as { phone_confirmed_at?: unknown } | null)
      ?.phone_confirmed_at,
  ),
);
const mobileStatusLabel = computed(() =>
  isMobileVerified.value ? t("user.verified") : t("user.unverified"),
);
const mobileStatusDescription = computed(() => {
  if (authPhone.value && isMobileVerified.value)
    return t("user.mobileVerifiedDesc");
  if (profile.value?.phone || authPhone.value)
    return t("user.mobileUnverifiedDesc");
  return t("user.mobilePlaceholderDesc");
});

// ── Editable form state ──
const firstName = ref("");
const lastName = ref("");
const phone = ref("");
const avatarPreview = ref<string | null>(null);
const avatarFile = ref<File | null>(null);
const avatarDeleted = ref(false);
const uploadingAvatar = ref(false);

// Sync form with profile when it loads
watch(
  () => profile.value,
  (p) => {
    if (p) {
      firstName.value = p.firstName ?? "";
      lastName.value = p.lastName ?? "";
      phone.value = p.phone ?? "";
      avatarPreview.value = p.avatarUrl ?? null;
    }
  },
  { immediate: true },
);

function handleAvatarSelect(file: File | File[] | null | undefined) {
  const f = Array.isArray(file) ? file[0] : file;
  if (!f) return;
  avatarFile.value = f;
  avatarDeleted.value = false;
  avatarPreview.value = URL.createObjectURL(f);
}

function handleAvatarDelete() {
  avatarFile.value = null;
  avatarDeleted.value = true;
  avatarPreview.value = null;
}

// ── Save handler ──
const saving = ref(false);

const hasChanges = computed(() => {
  if (!profile.value)
    return Boolean(
      firstName.value.trim() || lastName.value.trim() || phone.value.trim(),
    );
  return (
    firstName.value !== (profile.value.firstName ?? "") ||
    lastName.value !== (profile.value.lastName ?? "") ||
    phone.value !== (profile.value.phone ?? "") ||
    avatarFile.value !== null ||
    avatarDeleted.value
  );
});

async function handleSave() {
  saving.value = true;
  try {
    let newAvatarUrl: string | null | undefined = undefined;

    if (avatarFile.value) {
      uploadingAvatar.value = true;
      const body = new FormData();
      body.append("file", avatarFile.value);
      const res = await $fetch<{ avatarUrl: string }>("/api/user/avatar", {
        method: "POST",
        body,
      });
      newAvatarUrl = res.avatarUrl;
      avatarFile.value = null;
      uploadingAvatar.value = false;
    } else if (avatarDeleted.value) {
      newAvatarUrl = null;
    }

    const ok = await updateProfile({
      firstName: firstName.value.trim() || null,
      lastName: lastName.value.trim() || null,
      fullName:
        [firstName.value.trim(), lastName.value.trim()]
          .filter(Boolean)
          .join(" ") || null,
      phone: phone.value || null,
      ...(newAvatarUrl !== undefined ? { avatarUrl: newAvatarUrl } : {}),
    });

    avatarDeleted.value = false;

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
  } catch (e) {
    uploadingAvatar.value = false;
    toast.add({
      title: t("user.saveError"),
      description: e instanceof Error ? e.message : undefined,
      icon: "bx:error-circle",
      color: "error",
    });
  } finally {
    saving.value = false;
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
          v-for="i in 5"
          :key="i"
          class="h-10 animate-pulse rounded bg-elevated"
        />
      </div>

      <!-- Profile form -->
      <form v-else class="space-y-5" @submit.prevent="handleSave">
        <fieldset :disabled="saving" class="space-y-5">
          <!-- Avatar -->
          <div>
            <label class="mb-2 block text-sm font-medium">{{
              t("user.profilePhoto")
            }}</label>
            <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
              <!-- Preview + delete button -->
              <div class="relative shrink-0">
                <div
                  class="h-20 w-20 overflow-hidden rounded-full border bg-elevated"
                >
                  <img
                    v-if="avatarPreview"
                    :src="avatarPreview"
                    alt="avatar"
                    class="h-full w-full object-cover"
                  />
                  <div
                    v-else
                    class="flex h-full w-full items-center justify-center text-muted"
                  >
                    <UIcon name="bx:user" class="text-3xl" />
                  </div>
                </div>
                <UButton
                  v-if="avatarPreview"
                  icon="bx:x"
                  size="xs"
                  color="error"
                  variant="solid"
                  class="absolute -right-1 -top-1 rounded-full"
                  :title="t('user.removePhoto')"
                  @click.prevent="handleAvatarDelete"
                />
              </div>

              <!-- Upload zone -->
              <div class="flex-1">
                <UFileUpload
                  accept="image/jpeg,image/png,image/webp"
                  :label="t('user.uploadPhoto')"
                  :description="t('user.uploadPhotoHint')"
                  icon="bx:upload"
                  variant="area"
                  :dropzone="true"
                  :interactive="true"
                  :preview="false"
                  :disabled="saving || uploadingAvatar"
                  @update:model-value="handleAvatarSelect"
                />
              </div>
            </div>
          </div>

          <!-- First Name + Last Name -->
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-sm font-medium">{{
                t("user.firstName")
              }}</label>
              <UInput
                v-model="firstName"
                icon="bx:user"
                :placeholder="t('user.firstName')"
                size="lg"
              />
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium">{{
                t("user.lastName")
              }}</label>
              <UInput
                v-model="lastName"
                icon="bx:user"
                :placeholder="t('user.lastName')"
                size="lg"
              />
            </div>
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

          <UAlert
            color="neutral"
            variant="soft"
            icon="bx:mobile"
            :title="`${t('user.mobileRegistration')}: ${mobileStatusLabel}`"
            :description="mobileStatusDescription"
          />

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
        </fieldset>

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
