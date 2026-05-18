<script setup lang="ts">
import type { CustomerTaxProfileInput } from "~/types/user";

const { t } = useI18n();
const toast = useToast();
const { userEmail } = useAuthSession();
const { profile: userProfile } = useUserProfile();
const {
  profile: taxProfile,
  available,
  loading,
  saving,
  saveTaxProfile,
} = useTaxProfile();

const kindOptions = computed(() => [
  { value: "person", label: t("user.taxProfilePerson") },
  { value: "company", label: t("user.taxProfileCompany") },
]);
const branchOptions = computed(() => [
  { value: "head_office", label: t("user.taxHeadOffice") },
  { value: "branch", label: t("user.taxBranch") },
]);
const form = reactive<CustomerTaxProfileInput>({
  customerKind: "person",
  legalName: "",
  taxId: "",
  branchType: "none",
  branchCode: "",
  billingAddress: "",
  phone: "",
  email: "",
});
const baselineSnapshot = ref("");

function formSnapshot() {
  return JSON.stringify({
    customerKind: form.customerKind,
    legalName: form.legalName.trim(),
    taxId: form.taxId.trim(),
    branchType: form.customerKind === "person" ? "none" : form.branchType,
    branchCode:
      form.customerKind === "company" && form.branchType === "branch"
        ? form.branchCode.trim()
        : "",
    billingAddress: form.billingAddress.trim(),
    phone: form.phone.trim(),
    email: form.email.trim(),
  });
}

function applyDefaults() {
  form.customerKind = "person";
  form.legalName = userProfile.value?.fullName ?? "";
  form.taxId = "";
  form.branchType = "none";
  form.branchCode = "";
  form.billingAddress = "";
  form.phone = userProfile.value?.phone ?? "";
  form.email = userEmail.value ?? "";
  baselineSnapshot.value = formSnapshot();
}

function applyExistingProfile() {
  if (!taxProfile.value) {
    applyDefaults();
    return;
  }

  form.customerKind = taxProfile.value.customerKind;
  form.legalName = taxProfile.value.legalName;
  form.taxId = taxProfile.value.taxId;
  form.branchType = taxProfile.value.branchType;
  form.branchCode = taxProfile.value.branchCode;
  form.billingAddress = taxProfile.value.billingAddress;
  form.phone = taxProfile.value.phone;
  form.email = taxProfile.value.email;
  baselineSnapshot.value = formSnapshot();
}

watch(
  () => taxProfile.value,
  () => {
    applyExistingProfile();
  },
  { immediate: true },
);

watch(
  () => form.customerKind,
  (customerKind) => {
    if (customerKind === "person") {
      form.branchType = "none";
      form.branchCode = "";
    } else if (form.branchType === "none") {
      form.branchType = "head_office";
    }
  },
);

watch(
  () => form.branchType,
  (branchType) => {
    if (branchType !== "branch") {
      form.branchCode = "";
    }
  },
);

// ── Edit mode ──
// When data exists → form is locked (editing=false). User must press Edit first.
// When no data → form is immediately open (editing=true).
const editing = ref(false);

watch(
  () => taxProfile.value,
  (p) => {
    editing.value = !p; // no data → editable; data exists → locked
  },
  { immediate: true },
);

function handleEdit() {
  editing.value = true;
}

const hasChanges = computed(() => formSnapshot() !== baselineSnapshot.value);
const canSave = computed(() => {
  if (!available.value || saving.value || !editing.value) return false;
  if (
    !form.legalName.trim() ||
    !form.taxId.trim() ||
    !form.billingAddress.trim()
  ) {
    return false;
  }
  if (
    form.customerKind === "company" &&
    form.branchType === "branch" &&
    !form.branchCode.trim()
  ) {
    return false;
  }
  return hasChanges.value;
});

async function handleSave() {
  if (!canSave.value) return;

  try {
    await saveTaxProfile({
      customerKind: form.customerKind,
      legalName: form.legalName.trim(),
      taxId: form.taxId.trim(),
      branchType: form.customerKind === "person" ? "none" : form.branchType,
      branchCode:
        form.customerKind === "company" && form.branchType === "branch"
          ? form.branchCode.trim()
          : "",
      billingAddress: form.billingAddress.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
    });
    toast.add({
      title: t("user.taxProfileSaveSuccess"),
      icon: "bx:check-circle",
      color: "success",
    });
    editing.value = false; // Lock form after successful save
  } catch (error) {
    toast.add({
      title: t("user.taxProfileSaveError"),
      description: error instanceof Error ? error.message : undefined,
      icon: "bx:error-circle",
      color: "error",
    });
  }
}
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="!available"
      color="warning"
      variant="soft"
      icon="bx:chip"
      :title="t('user.taxProfileUnavailable')"
      :description="t('user.taxProfileUnavailableDesc')"
    />

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold">{{ t("user.taxProfile") }}</h2>
            <p class="text-sm text-muted">{{ t("user.taxProfileSubtitle") }}</p>
          </div>
          <!-- Edit button — only shown when data exists and not yet editing -->
          <UButton
            v-if="taxProfile && !editing"
            icon="bx:edit"
            size="xs"
            color="neutral"
            variant="ghost"
            :label="t('user.edit')"
            @click="handleEdit"
          />
        </div>
      </template>

      <div v-if="loading" class="space-y-4">
        <div
          v-for="i in 5"
          :key="i"
          class="h-10 animate-pulse rounded bg-elevated"
        />
      </div>

      <div v-else class="space-y-5">
        <UAlert
          color="neutral"
          variant="soft"
          icon="bx:receipt"
          :title="
            taxProfile
              ? t('user.taxProfileDefaultTitle')
              : t('user.taxProfileEmptyTitle')
          "
          :description="
            taxProfile
              ? t('user.taxProfileWillBeUsed')
              : t('user.taxProfileEmptyDesc')
          "
        />

        <div class="grid gap-4 md:grid-cols-2">
          <UFormField :label="t('user.taxProfileKind')">
            <USelect
              v-model="form.customerKind"
              :items="kindOptions"
              value-key="value"
              class="w-full"
              :disabled="!editing"
            />
          </UFormField>

          <UFormField class="md:col-span-2" :label="t('user.taxLegalName')">
            <UInput
              v-model="form.legalName"
              icon="bx:user-pin"
              class="w-full"
              :disabled="!editing"
            />
          </UFormField>

          <UFormField :label="t('user.taxId')">
            <UInput
              v-model="form.taxId"
              icon="bx:card"
              class="w-full"
              :disabled="!editing"
            />
          </UFormField>

          <UFormField
            v-if="form.customerKind === 'company'"
            :label="t('user.taxBranchType')"
          >
            <USelect
              v-model="form.branchType"
              :items="branchOptions"
              value-key="value"
              class="w-full"
              :disabled="!editing"
            />
          </UFormField>

          <UFormField
            v-if="
              form.customerKind === 'company' && form.branchType === 'branch'
            "
            :label="t('user.taxBranchCode')"
          >
            <UInput
              v-model="form.branchCode"
              icon="bx:buildings"
              class="w-full"
              :disabled="!editing"
            />
          </UFormField>

          <UFormField
            class="md:col-span-2"
            :label="t('user.taxBillingAddress')"
          >
            <UTextarea
              v-model="form.billingAddress"
              class="w-full"
              :rows="4"
              :disabled="!editing"
            />
          </UFormField>

          <UFormField :label="t('user.phone')">
            <UInput
              v-model="form.phone"
              icon="bx:phone"
              class="w-full"
              :disabled="!editing"
            />
          </UFormField>

          <UFormField :label="t('user.email')">
            <UInput
              v-model="form.email"
              icon="bx:envelope"
              class="w-full"
              :disabled="!editing"
            />
          </UFormField>
        </div>

        <div v-if="editing" class="flex justify-end">
          <UButton
            icon="bx:check"
            :label="saving ? t('user.saving') : t('user.confirm')"
            color="primary"
            :loading="saving"
            :disabled="!canSave"
            @click="handleSave"
          />
        </div>
      </div>
    </UCard>
  </div>
</template>
