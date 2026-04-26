<script setup lang="ts">
import { getAdminApiErrorMessage, type AdminApiMeta } from "~/utils/admin-api";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["super_admin"],
});

type MainCategoryItem = {
  key: string;
  labelTh: string;
  labelEn: string;
  icon: string;
  descriptionTh: string;
  descriptionEn: string;
  isActive: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

const toast = useToast();
const editFormRef = ref<HTMLElement | null>(null);

const form = reactive<MainCategoryItem>({
  key: "",
  labelTh: "",
  labelEn: "",
  icon: "",
  descriptionTh: "",
  descriptionEn: "",
  isActive: true,
  sortOrder: 0,
});

const editingKey = ref<string | null>(null);
const saving = ref(false);
const deletingKey = ref<string | null>(null);

const { data, pending, error, refresh } = await useFetch<{
  items: MainCategoryItem[];
  meta?: AdminApiMeta;
}>("/api/admin/main-categories", {
  key: "admin-main-categories",
  default: () => ({ items: [] }),
});

const items = computed(() => data.value?.items ?? []);
const adminWarning = computed(() => data.value?.meta?.warning ?? null);
const loadErrorMessage = computed(() =>
  getAdminApiErrorMessage(error.value, "Unknown main categories error"),
);

function resetForm() {
  editingKey.value = null;
  form.key = "";
  form.labelTh = "";
  form.labelEn = "";
  form.icon = "";
  form.descriptionTh = "";
  form.descriptionEn = "";
  form.isActive = true;
  form.sortOrder = 0;
}

function editItem(item: MainCategoryItem) {
  editingKey.value = item.key;
  form.key = item.key;
  form.labelTh = item.labelTh;
  form.labelEn = item.labelEn;
  form.icon = item.icon;
  form.descriptionTh = item.descriptionTh;
  form.descriptionEn = item.descriptionEn;
  form.isActive = item.isActive;
  form.sortOrder = item.sortOrder;

  nextTick(() => {
    editFormRef.value?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });
}

async function saveCategory() {
  saving.value = true;

  try {
    const path = editingKey.value
      ? `/api/admin/main-categories/${encodeURIComponent(editingKey.value)}`
      : "/api/admin/main-categories";

    await $fetch(path, {
      method: editingKey.value ? "PATCH" : "POST",
      body: {
        key: form.key,
        labelTh: form.labelTh,
        labelEn: form.labelEn,
        icon: form.icon,
        descriptionTh: form.descriptionTh,
        descriptionEn: form.descriptionEn,
        isActive: form.isActive,
        sortOrder: form.sortOrder,
      },
    });

    toast.add({
      title: editingKey.value
        ? "Main category updated"
        : "Main category created",
      color: "success",
      icon: "bx:check-circle",
    });

    resetForm();
    await refresh();
  } catch (saveError) {
    toast.add({
      title: editingKey.value ? "Update failed" : "Create failed",
      description: getAdminApiErrorMessage(saveError, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    saving.value = false;
  }
}

async function deleteItem(item: MainCategoryItem) {
  if (item.key === "others") {
    toast.add({
      title: "Delete not allowed",
      description: "The fallback 'others' category must remain in the system.",
      color: "warning",
      icon: "bx:error-circle",
    });
    return;
  }

  if (import.meta.client) {
    const shouldDelete = window.confirm(
      `Delete main category '${item.labelTh || item.key}'? This cannot be undone.`,
    );

    if (!shouldDelete) {
      return;
    }
  }

  deletingKey.value = item.key;

  try {
    await $fetch(`/api/admin/main-categories/${encodeURIComponent(item.key)}`, {
      method: "DELETE",
    });

    if (editingKey.value === item.key) {
      resetForm();
    }

    toast.add({
      title: "Main category deleted",
      color: "success",
      icon: "bx:trash",
    });

    await refresh();
  } catch (deleteError) {
    toast.add({
      title: "Delete failed",
      description: getAdminApiErrorMessage(deleteError, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    deletingKey.value = null;
  }
}
</script>

<template>
  <div class="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold">Main categories</h2>
            <p class="text-sm text-muted">
              Source of truth for the primary category in product create/edit.
            </p>
          </div>

          <UButton
            color="primary"
            variant="soft"
            size="sm"
            icon="bx:refresh"
            :loading="pending"
            @click="refresh"
          >
            Refresh
          </UButton>
        </div>
      </template>

      <UAlert
        v-if="adminWarning"
        class="mb-4"
        color="warning"
        variant="soft"
        :title="adminWarning.title"
        :description="adminWarning.message"
      />

      <UAlert
        v-if="error"
        class="mb-4"
        color="error"
        variant="soft"
        title="Failed to load main categories"
        :description="loadErrorMessage"
      />

      <div v-if="pending" class="py-8 text-sm text-muted">
        Loading categories...
      </div>

      <div v-else-if="items.length === 0" class="py-8 text-sm text-muted">
        No main categories yet. Create the first one from the form.
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="item in items"
          :key="item.key"
          class="rounded-xl border border-default p-4"
        >
          <div
            class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
          >
            <div class="space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="font-medium">{{ item.labelTh }}</h3>
                <UBadge color="neutral" variant="soft">{{ item.key }}</UBadge>
                <UBadge
                  :color="item.isActive ? 'success' : 'warning'"
                  variant="soft"
                >
                  {{ item.isActive ? "active" : "inactive" }}
                </UBadge>
              </div>
              <p class="text-sm text-muted">{{ item.labelEn }}</p>
              <p v-if="item.icon" class="text-xs text-muted">
                Icon: {{ item.icon }}
              </p>
              <p v-if="item.descriptionTh" class="text-sm text-muted">
                {{ item.descriptionTh }}
              </p>
            </div>

            <div class="flex flex-col items-start gap-2 lg:items-end">
              <div class="text-right text-xs text-muted">
                <p>Sort order: {{ item.sortOrder }}</p>
                <p>Updated: {{ item.updatedAt || "—" }}</p>
              </div>

              <div class="flex flex-wrap gap-2 lg:justify-end">
                <UButton
                  color="primary"
                  variant="soft"
                  size="sm"
                  icon="bx:edit"
                  @click="editItem(item)"
                >
                  Edit
                </UButton>

                <UButton
                  color="error"
                  variant="soft"
                  size="sm"
                  icon="bx:trash"
                  :loading="deletingKey === item.key"
                  :disabled="item.key === 'others'"
                  @click="deleteItem(item)"
                >
                  Delete
                </UButton>
              </div>

              <p v-if="item.key === 'others'" class="text-xs text-muted">
                Fallback category cannot be deleted.
              </p>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <div ref="editFormRef">
      <UCard>
        <template #header>
          <div>
            <h2 class="text-lg font-semibold">
              {{ editingKey ? "Edit main category" : "Create main category" }}
            </h2>
            <p class="text-sm text-muted">
              Product forms can only choose categories created here.
            </p>
          </div>
        </template>

        <form class="space-y-4" @submit.prevent="saveCategory">
          <UAlert
            v-if="editingKey"
            color="primary"
            variant="soft"
            title="Editing existing category"
            :description="`You are editing ${editingKey}. Update the fields below and save.`"
          />

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Key" required>
              <UInput v-model="form.key" placeholder="cordless_drills" />
            </UFormField>

            <UFormField label="Sort order">
              <UInput v-model.number="form.sortOrder" type="number" min="0" />
            </UFormField>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Label (TH)" required>
              <UInput v-model="form.labelTh" placeholder="สว่านไร้สาย" />
            </UFormField>

            <UFormField label="Label (EN)" required>
              <UInput v-model="form.labelEn" placeholder="Cordless Drills" />
            </UFormField>
          </div>

          <UFormField label="Icon">
            <UInput v-model="form.icon" placeholder="bx:drill" />
          </UFormField>

          <UFormField label="Description (TH)">
            <UTextarea v-model="form.descriptionTh" :rows="3" />
          </UFormField>

          <UFormField label="Description (EN)">
            <UTextarea v-model="form.descriptionEn" :rows="3" />
          </UFormField>

          <UCheckbox
            v-model="form.isActive"
            label="Active and selectable in product forms"
          />

          <div class="flex gap-2">
            <UButton type="submit" color="primary" :loading="saving">
              {{ editingKey ? "Save category" : "Create category" }}
            </UButton>
            <UButton
              type="button"
              variant="soft"
              color="neutral"
              @click="resetForm"
            >
              Reset
            </UButton>
          </div>
        </form>
      </UCard>
    </div>
  </div>
</template>
