<script setup lang="ts">
/**
 * Address CRUD section — list / add / edit / delete.
 *
 * Reuses:
 *  - useAddresses()  → CRUD + reactive state
 *  - useSupabaseUser()
 *  - i18n keys: user.*
 */
import type { Address } from "~/types/user";

const { t } = useI18n();
const toast = useToast();
const { isB2C, activeContext, currentCompany } = useCompanyContext();
const {
  personalAddresses,
  companyAddresses,
  loading,
  error,
  fetchAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
} = useAddresses();

// ── Fetch on mount ──
onMounted(() => fetchAddresses());

watch(
  () => activeContext.value.companyId,
  () => {
    void fetchAddresses();
  },
);

const visibleAddresses = computed(() => {
  if (isB2C.value || !activeContext.value.companyId) {
    return personalAddresses.value;
  }

  return companyAddresses.value.filter(
    (address) => address.companyId === activeContext.value.companyId,
  );
});

const cardTitle = computed(() =>
  isB2C.value ? t("user.addresses") : "Company Addresses",
);

const addButtonLabel = computed(() =>
  isB2C.value ? t("user.addAddress") : "Add Company Address",
);

const formTitle = computed(() => {
  if (editingId.value) return t("user.editAddress");
  return isB2C.value ? t("user.addAddress") : "Add Company Address";
});

const emptyMessage = computed(() => {
  if (isB2C.value) return t("user.noAddresses");
  if (currentCompany.value?.name) {
    return `No addresses found for ${currentCompany.value.name}.`;
  }
  return "No company addresses found.";
});

const scopeMessage = computed(() => {
  if (isB2C.value) return "Personal delivery addresses";
  if (currentCompany.value?.name) {
    return `Managing delivery addresses for ${currentCompany.value.name}`;
  }
  return "Managing company delivery addresses";
});

// ── Form state ──
const showForm = ref(false);
const editingId = ref<string | null>(null);

const form = reactive({
  title: "",
  contactName: "",
  contactPhone: "",
  fullAddress: "",
  subDistrict: "",
  district: "",
  province: "",
  postalCode: "",
  note: "",
  isDefault: false,
});

function resetForm() {
  form.title = "";
  form.contactName = "";
  form.contactPhone = "";
  form.fullAddress = "";
  form.subDistrict = "";
  form.district = "";
  form.province = "";
  form.postalCode = "";
  form.note = "";
  form.isDefault = false;
  editingId.value = null;
  showForm.value = false;
}

function openAdd() {
  resetForm();
  showForm.value = true;
}

function openEdit(addr: Address) {
  editingId.value = addr.id;
  form.title = addr.title;
  form.contactName = addr.contactName ?? "";
  form.contactPhone = addr.contactPhone ?? "";
  form.fullAddress = addr.fullAddress;
  form.subDistrict = addr.subDistrict ?? "";
  form.district = addr.district ?? "";
  form.province = addr.province ?? "";
  form.postalCode = addr.postalCode ?? "";
  form.note = addr.note ?? "";
  form.isDefault = addr.isDefault;
  showForm.value = true;
}

const saving = ref(false);

async function handleSave() {
  saving.value = true;

  const fields = {
    title: form.title,
    contactName: form.contactName || null,
    contactPhone: form.contactPhone || null,
    fullAddress: form.fullAddress,
    subDistrict: form.subDistrict || null,
    district: form.district || null,
    province: form.province || null,
    postalCode: form.postalCode || null,
    latitude: null,
    longitude: null,
    note: form.note || null,
    isDefault: form.isDefault,
  };

  try {
    if (editingId.value) {
      const ok = await updateAddress(editingId.value, fields);
      if (!ok) throw new Error("update failed");
    } else {
      const addr = await createAddress({
        ...fields,
        userId: null,
        companyId: isB2C.value ? null : activeContext.value.companyId,
      });
      if (!addr) throw new Error("create failed");
    }

    toast.add({
      title: t("user.saveSuccess"),
      icon: "bx:check-circle",
      color: "success",
    });
    resetForm();
  } catch {
    toast.add({
      title: t("user.saveError"),
      description: error.value ?? undefined,
      icon: "bx:error-circle",
      color: "error",
    });
  } finally {
    saving.value = false;
  }
}

// ── Delete confirmation ──
const deleteTarget = ref<string | null>(null);

async function confirmDelete() {
  if (!deleteTarget.value) return;
  const ok = await deleteAddress(deleteTarget.value);
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
  deleteTarget.value = null;
}

async function handleSetDefault(id: string) {
  await updateAddress(id, { isDefault: true });
}
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold">{{ cardTitle }}</h2>
            <p class="text-sm text-muted">{{ scopeMessage }}</p>
          </div>
          <UButton
            :label="addButtonLabel"
            icon="bx:plus"
            size="sm"
            @click="openAdd"
          />
        </div>
      </template>

      <!-- Loading -->
      <div v-if="loading" class="space-y-4">
        <div
          v-for="i in 2"
          :key="i"
          class="h-20 animate-pulse rounded bg-elevated"
        />
      </div>

      <!-- Empty -->
      <div
        v-else-if="!visibleAddresses.length && !showForm"
        class="py-8 text-center"
      >
        <UIcon name="bx:map" class="mx-auto mb-2 text-4xl text-muted" />
        <p class="text-muted">{{ emptyMessage }}</p>
      </div>

      <!-- Address list -->
      <div v-else class="space-y-3">
        <div
          v-for="addr in visibleAddresses"
          :key="addr.id"
          class="flex items-start justify-between gap-3 rounded-lg border p-4"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <p class="font-medium">{{ addr.title }}</p>
              <UBadge
                v-if="addr.isDefault"
                :label="t('user.defaultAddress')"
                color="primary"
                variant="subtle"
                size="xs"
              />
            </div>
            <p class="mt-1 text-sm text-muted">{{ addr.fullAddress }}</p>
            <p
              v-if="addr.contactName || addr.contactPhone"
              class="mt-1 text-xs text-muted"
            >
              {{
                [addr.contactName, addr.contactPhone]
                  .filter(Boolean)
                  .join(" · ")
              }}
            </p>
          </div>
          <div class="flex shrink-0 gap-1">
            <UButton
              v-if="!addr.isDefault"
              icon="bx:star"
              size="xs"
              color="neutral"
              variant="ghost"
              :title="t('user.setAsDefault')"
              @click="handleSetDefault(addr.id)"
            />
            <UButton
              icon="bx:edit"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="openEdit(addr)"
            />
            <UButton
              icon="bx:trash"
              size="xs"
              color="error"
              variant="ghost"
              @click="deleteTarget = addr.id"
            />
          </div>
        </div>
      </div>
    </UCard>

    <!-- Add / Edit Form -->
    <UCard v-if="showForm">
      <template #header>
        <h3 class="font-semibold">{{ formTitle }}</h3>
      </template>

      <div class="grid gap-4 sm:grid-cols-2">
        <UInput
          v-model="form.title"
          :placeholder="t('user.addressTitle')"
          required
        />
        <UInput
          v-model="form.contactName"
          :placeholder="t('user.contactName')"
        />
        <UInput
          v-model="form.contactPhone"
          :placeholder="t('user.contactPhone')"
        />
        <UInput v-model="form.postalCode" :placeholder="t('user.postalCode')" />
        <UInput
          v-model="form.fullAddress"
          :placeholder="t('user.fullAddress')"
          class="sm:col-span-2"
        />
        <UInput
          v-model="form.subDistrict"
          :placeholder="t('user.subDistrict')"
        />
        <UInput v-model="form.district" :placeholder="t('user.district')" />
        <UInput v-model="form.province" :placeholder="t('user.province')" />
        <UInput
          v-model="form.note"
          :placeholder="t('user.addressNote')"
          class="sm:col-span-2"
        />

        <label class="flex items-center gap-2 sm:col-span-2">
          <input
            v-model="form.isDefault"
            type="checkbox"
            class="h-4 w-4 rounded"
          />
          <span class="text-sm">{{ t("user.setAsDefault") }}</span>
        </label>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            :label="t('user.cancel')"
            color="neutral"
            variant="ghost"
            @click="resetForm"
          />
          <UButton
            :label="t('user.save')"
            icon="bx:check"
            :loading="saving"
            :disabled="!form.title || !form.fullAddress"
            @click="handleSave"
          />
        </div>
      </template>
    </UCard>

    <!-- Delete confirmation modal -->
    <UModal v-model:open="deleteTarget">
      <template #default>
        <div class="p-6 text-center">
          <UIcon
            name="bx:error-circle"
            class="mx-auto mb-3 text-4xl text-error"
          />
          <p class="mb-1 font-semibold">{{ t("user.confirmDelete") }}</p>
          <p class="mb-4 text-sm text-muted">
            {{ t("user.confirmDeleteAddress") }}
          </p>
          <div class="flex justify-center gap-2">
            <UButton
              :label="t('user.cancel')"
              color="neutral"
              variant="ghost"
              @click="deleteTarget = null"
            />
            <UButton
              :label="t('user.deleteAddress')"
              color="error"
              icon="bx:trash"
              @click="confirmDelete"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
