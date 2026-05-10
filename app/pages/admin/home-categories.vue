<script setup lang="ts">
import { getAdminApiErrorMessage } from "~/utils/admin-api";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["super_admin"],
});

type HomeCategoryOption = {
  id: string;
  groupId: string;
  optionKey: string;
  labelTh: string;
  labelEn: string;
  labelCn: string;
  labelJp: string;
  searchQueryTh: string;
  searchQueryEn: string;
  searchQueryCn: string;
  searchQueryJp: string;
  sortOrder: number;
  isActive: boolean;
};

type HomeCategoryGroup = {
  id: string;
  mainCategoryKey: string;
  labelTh: string;
  labelEn: string;
  labelCn: string;
  labelJp: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
  options: HomeCategoryOption[];
};

type MainCategoryOption = {
  value: string;
  label: string;
  icon: string;
  isActive: boolean;
};

const ADMIN_FORM_GRID_CLASS = "grid gap-4 md:grid-cols-6";
const FIELD_CLASS = "min-w-0 md:col-span-2";
const TEXTAREA_FIELD_CLASS = "min-w-0 md:col-span-3";

const toast = useToast();
const selectedGroupId = ref<string | null>(null);
const savingGroup = ref(false);
const savingOption = ref(false);
const deletingGroupId = ref<string | null>(null);
const deletingOptionId = ref<string | null>(null);
const editingOptionId = ref<string | null>(null);

const groupForm = reactive({
  id: "",
  mainCategoryKey: "",
  labelTh: "",
  labelEn: "",
  labelCn: "",
  labelJp: "",
  icon: "",
  sortOrder: 0,
  isActive: true,
});

const optionForm = reactive({
  optionKey: "",
  labelTh: "",
  labelEn: "",
  labelCn: "",
  labelJp: "",
  searchQueryTh: "",
  searchQueryEn: "",
  searchQueryCn: "",
  searchQueryJp: "",
  sortOrder: 0,
  isActive: true,
});

const { data, pending, error, refresh } = await useFetch<{
  items: HomeCategoryGroup[];
  mainCategoryOptions: MainCategoryOption[];
}>("/api/admin/home-categories", {
  key: "admin-home-categories",
  default: () => ({ items: [], mainCategoryOptions: [] }),
});

const groups = computed(() => data.value?.items ?? []);
const mainCategoryOptions = computed(
  () => data.value?.mainCategoryOptions ?? [],
);
const selectItems = computed(() =>
  mainCategoryOptions.value.map((item) => ({
    value: item.value,
    label: item.isActive ? item.label : `${item.label} (inactive)`,
  })),
);
const selectedGroup = computed(
  () =>
    groups.value.find((group) => group.id === selectedGroupId.value) ?? null,
);
const isEditingGroup = computed(() => Boolean(groupForm.id));
const loadErrorMessage = computed(() =>
  getAdminApiErrorMessage(error.value, "Unknown home categories error"),
);

function resetOptionForm() {
  editingOptionId.value = null;
  optionForm.optionKey = "";
  optionForm.labelTh = "";
  optionForm.labelEn = "";
  optionForm.labelCn = "";
  optionForm.labelJp = "";
  optionForm.searchQueryTh = "";
  optionForm.searchQueryEn = "";
  optionForm.searchQueryCn = "";
  optionForm.searchQueryJp = "";
  optionForm.sortOrder = 0;
  optionForm.isActive = true;
}

function resetGroupForm() {
  selectedGroupId.value = null;
  groupForm.id = "";
  groupForm.mainCategoryKey = selectItems.value[0]?.value ?? "";
  groupForm.labelTh = "";
  groupForm.labelEn = "";
  groupForm.labelCn = "";
  groupForm.labelJp = "";
  groupForm.icon = "";
  groupForm.sortOrder = 0;
  groupForm.isActive = true;
  resetOptionForm();
}

function selectGroup(group: HomeCategoryGroup) {
  selectedGroupId.value = group.id;
  groupForm.id = group.id;
  groupForm.mainCategoryKey = group.mainCategoryKey;
  groupForm.labelTh = group.labelTh;
  groupForm.labelEn = group.labelEn;
  groupForm.labelCn = group.labelCn;
  groupForm.labelJp = group.labelJp;
  groupForm.icon = group.icon;
  groupForm.sortOrder = group.sortOrder;
  groupForm.isActive = group.isActive;
  resetOptionForm();
}

function startEditOption(option: HomeCategoryOption) {
  editingOptionId.value = option.id;
  optionForm.optionKey = option.optionKey;
  optionForm.labelTh = option.labelTh;
  optionForm.labelEn = option.labelEn;
  optionForm.labelCn = option.labelCn;
  optionForm.labelJp = option.labelJp;
  optionForm.searchQueryTh = option.searchQueryTh;
  optionForm.searchQueryEn = option.searchQueryEn;
  optionForm.searchQueryCn = option.searchQueryCn;
  optionForm.searchQueryJp = option.searchQueryJp;
  optionForm.sortOrder = option.sortOrder;
  optionForm.isActive = option.isActive;
}

async function refreshAndReselect(groupId = selectedGroupId.value) {
  await refresh();
  if (!groupId) return;
  const fresh = groups.value.find((group) => group.id === groupId);
  if (fresh) selectGroup(fresh);
}

async function saveGroup() {
  savingGroup.value = true;
  try {
    const body = { resource: "group", ...groupForm };
    const response = await $fetch<{ item?: HomeCategoryGroup }>(
      "/api/admin/home-categories",
      { method: isEditingGroup.value ? "PATCH" : "POST", body },
    );
    const groupId = isEditingGroup.value ? groupForm.id : response.item?.id;
    toast.add({
      title: isEditingGroup.value
        ? "Home category updated"
        : "Home category created",
      color: "success",
      icon: "bx:check-circle",
    });
    await refreshAndReselect(groupId ?? null);
  } catch (saveError) {
    toast.add({
      title: isEditingGroup.value ? "Update failed" : "Create failed",
      description: getAdminApiErrorMessage(saveError, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    savingGroup.value = false;
  }
}

async function deleteGroup(group: HomeCategoryGroup) {
  if (
    import.meta.client &&
    !window.confirm(
      `Delete '${group.labelEn || group.mainCategoryKey}' and all options?`,
    )
  ) {
    return;
  }
  deletingGroupId.value = group.id;
  try {
    await $fetch(`/api/admin/home-categories/group/${group.id}`, {
      method: "DELETE",
    });
    toast.add({
      title: "Home category deleted",
      color: "success",
      icon: "bx:trash",
    });
    if (selectedGroupId.value === group.id) resetGroupForm();
    await refresh();
  } catch (deleteError) {
    toast.add({
      title: "Delete failed",
      description: getAdminApiErrorMessage(deleteError, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    deletingGroupId.value = null;
  }
}

async function saveOption() {
  if (!selectedGroup.value) return;
  savingOption.value = true;
  try {
    await $fetch("/api/admin/home-categories", {
      method: editingOptionId.value ? "PATCH" : "POST",
      body: {
        resource: "option",
        id: editingOptionId.value,
        groupId: selectedGroup.value.id,
        ...optionForm,
      },
    });
    toast.add({
      title: editingOptionId.value ? "Option updated" : "Option created",
      color: "success",
      icon: "bx:check-circle",
    });
    resetOptionForm();
    await refreshAndReselect(selectedGroup.value.id);
  } catch (saveError) {
    toast.add({
      title: editingOptionId.value ? "Update failed" : "Create failed",
      description: getAdminApiErrorMessage(saveError, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    savingOption.value = false;
  }
}

async function deleteOption(option: HomeCategoryOption) {
  if (!selectedGroup.value) return;
  if (
    import.meta.client &&
    !window.confirm(`Delete option '${option.labelEn}'?`)
  )
    return;
  deletingOptionId.value = option.id;
  try {
    await $fetch(`/api/admin/home-categories/option/${option.id}`, {
      method: "DELETE",
    });
    toast.add({ title: "Option deleted", color: "success", icon: "bx:trash" });
    if (editingOptionId.value === option.id) resetOptionForm();
    await refreshAndReselect(selectedGroup.value.id);
  } catch (deleteError) {
    toast.add({
      title: "Delete failed",
      description: getAdminApiErrorMessage(deleteError, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    deletingOptionId.value = null;
  }
}
</script>

<template>
  <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,1fr)]">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold">Home categories</h2>
            <p class="text-sm text-muted">
              Editable category-card groups and dropdown options for the
              homepage.
            </p>
          </div>
          <UButton
            icon="bx:refresh"
            variant="soft"
            :loading="pending"
            @click="refresh"
          >
            Refresh
          </UButton>
        </div>
      </template>

      <UAlert
        v-if="error"
        class="mb-4"
        color="error"
        variant="soft"
        title="Failed to load home categories"
        :description="loadErrorMessage"
      />

      <div class="mb-4">
        <UButton icon="bx:plus" color="primary" @click="resetGroupForm">
          New group
        </UButton>
      </div>

      <div v-if="pending" class="py-8 text-sm text-muted">Loading...</div>
      <div v-else-if="groups.length === 0" class="py-8 text-sm text-muted">
        No home category groups yet. Create the first group from the form.
      </div>

      <div v-else class="space-y-2">
        <button
          v-for="group in groups"
          :key="group.id"
          type="button"
          class="w-full rounded-xl border p-3 text-left transition hover:border-primary"
          :class="
            selectedGroupId === group.id
              ? 'border-primary bg-primary/5'
              : 'border-default'
          "
          @click="selectGroup(group)"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <UIcon
                  v-if="group.icon"
                  :name="group.icon"
                  class="size-4 text-muted"
                />
                <span class="font-medium">{{ group.labelEn }}</span>
                <UBadge color="neutral" variant="soft" size="xs">
                  {{ group.mainCategoryKey }}
                </UBadge>
                <UBadge
                  :color="group.isActive ? 'success' : 'warning'"
                  variant="soft"
                  size="xs"
                >
                  {{ group.isActive ? "active" : "inactive" }}
                </UBadge>
              </div>
              <p class="text-xs text-muted">
                {{ group.labelTh }} · {{ group.options.length }} option(s) ·
                sort
                {{ group.sortOrder }}
              </p>
            </div>
            <UButton
              color="error"
              variant="ghost"
              size="xs"
              icon="bx:trash"
              :loading="deletingGroupId === group.id"
              @click.stop="deleteGroup(group)"
            >
              Delete
            </UButton>
          </div>
        </button>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div>
          <h2 class="text-lg font-semibold">
            {{ isEditingGroup ? "Edit group" : "Create group" }}
          </h2>
          <p class="text-sm text-muted">
            Groups map to existing main categories. Options become homepage
            dropdown rows.
          </p>
        </div>
      </template>

      <form class="space-y-4" @submit.prevent="saveGroup">
        <div :class="ADMIN_FORM_GRID_CLASS">
          <UFormField label="Main category" required :class="FIELD_CLASS">
            <USelect
              v-model="groupForm.mainCategoryKey"
              :items="selectItems"
              placeholder="Select main category"
            />
          </UFormField>
          <UFormField label="Icon" :class="FIELD_CLASS">
            <UInput
              v-model="groupForm.icon"
              class="w-full"
              placeholder="bx:wrench"
            />
          </UFormField>
          <UFormField label="Sort order" :class="FIELD_CLASS">
            <UInput
              v-model.number="groupForm.sortOrder"
              class="w-full"
              type="number"
              min="0"
            />
          </UFormField>
          <UFormField label="Label TH" required :class="FIELD_CLASS">
            <UInput v-model="groupForm.labelTh" class="w-full" />
          </UFormField>
          <UFormField label="Label EN" required :class="FIELD_CLASS">
            <UInput v-model="groupForm.labelEn" class="w-full" />
          </UFormField>
          <UFormField label="Label CN" :class="FIELD_CLASS">
            <UInput v-model="groupForm.labelCn" class="w-full" />
          </UFormField>
          <UFormField label="Label JP" :class="FIELD_CLASS">
            <UInput v-model="groupForm.labelJp" class="w-full" />
          </UFormField>
        </div>

        <UCheckbox v-model="groupForm.isActive" label="Active" />

        <div class="flex flex-wrap gap-2">
          <UButton type="submit" color="primary" :loading="savingGroup">
            {{ isEditingGroup ? "Save group" : "Create group" }}
          </UButton>
          <UButton
            type="button"
            variant="soft"
            color="neutral"
            @click="resetGroupForm"
          >
            Reset
          </UButton>
        </div>
      </form>

      <template v-if="selectedGroup">
        <USeparator class="my-6" />
        <div class="space-y-4">
          <div>
            <h3 class="text-base font-semibold">Options</h3>
            <p class="text-sm text-muted">
              Search query fields are optional. If blank, the storefront uses
              the label.
            </p>
          </div>

          <div v-if="selectedGroup.options.length > 0" class="space-y-2">
            <div
              v-for="option in selectedGroup.options"
              :key="option.id"
              class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-default p-3"
            >
              <div class="space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-medium">{{ option.labelEn }}</span>
                  <UBadge color="neutral" variant="soft" size="xs">
                    {{ option.optionKey }}
                  </UBadge>
                  <UBadge
                    :color="option.isActive ? 'success' : 'warning'"
                    variant="soft"
                    size="xs"
                  >
                    {{ option.isActive ? "active" : "inactive" }}
                  </UBadge>
                </div>
                <p class="text-xs text-muted">
                  {{ option.labelTh }} · sort {{ option.sortOrder }}
                </p>
              </div>
              <div class="flex gap-2">
                <UButton
                  size="xs"
                  variant="soft"
                  icon="bx:edit"
                  @click="startEditOption(option)"
                >
                  Edit
                </UButton>
                <UButton
                  size="xs"
                  color="error"
                  variant="soft"
                  icon="bx:trash"
                  :loading="deletingOptionId === option.id"
                  @click="deleteOption(option)"
                >
                  Delete
                </UButton>
              </div>
            </div>
          </div>
          <p
            v-else
            class="rounded-lg border border-dashed border-default p-3 text-sm text-muted"
          >
            No options yet. Add one below.
          </p>

          <form
            class="space-y-4 rounded-xl bg-(--ui-bg-elevated)/50 p-3"
            @submit.prevent="saveOption"
          >
            <p class="text-sm font-medium">
              {{ editingOptionId ? "Edit option" : "Add option" }}
            </p>
            <div :class="ADMIN_FORM_GRID_CLASS">
              <UFormField label="Option key" required :class="FIELD_CLASS">
                <UInput
                  v-model="optionForm.optionKey"
                  class="w-full"
                  placeholder="s01"
                />
              </UFormField>
              <UFormField label="Sort order" :class="FIELD_CLASS">
                <UInput
                  v-model.number="optionForm.sortOrder"
                  class="w-full"
                  type="number"
                  min="0"
                />
              </UFormField>
              <UFormField label="Label TH" required :class="FIELD_CLASS">
                <UInput v-model="optionForm.labelTh" class="w-full" />
              </UFormField>
              <UFormField label="Label EN" required :class="FIELD_CLASS">
                <UInput v-model="optionForm.labelEn" class="w-full" />
              </UFormField>
              <UFormField label="Label CN" :class="FIELD_CLASS">
                <UInput v-model="optionForm.labelCn" class="w-full" />
              </UFormField>
              <UFormField label="Label JP" :class="FIELD_CLASS">
                <UInput v-model="optionForm.labelJp" class="w-full" />
              </UFormField>
              <UFormField label="Search query TH" :class="TEXTAREA_FIELD_CLASS">
                <UTextarea
                  v-model="optionForm.searchQueryTh"
                  class="w-full"
                  :rows="2"
                />
              </UFormField>
              <UFormField label="Search query EN" :class="TEXTAREA_FIELD_CLASS">
                <UTextarea
                  v-model="optionForm.searchQueryEn"
                  class="w-full"
                  :rows="2"
                />
              </UFormField>
              <UFormField label="Search query CN" :class="TEXTAREA_FIELD_CLASS">
                <UTextarea
                  v-model="optionForm.searchQueryCn"
                  class="w-full"
                  :rows="2"
                />
              </UFormField>
              <UFormField label="Search query JP" :class="TEXTAREA_FIELD_CLASS">
                <UTextarea
                  v-model="optionForm.searchQueryJp"
                  class="w-full"
                  :rows="2"
                />
              </UFormField>
            </div>
            <UCheckbox v-model="optionForm.isActive" label="Active" />
            <div class="flex flex-wrap gap-2">
              <UButton type="submit" color="primary" :loading="savingOption">
                {{ editingOptionId ? "Save option" : "Add option" }}
              </UButton>
              <UButton
                v-if="editingOptionId"
                type="button"
                variant="soft"
                color="neutral"
                @click="resetOptionForm"
              >
                Cancel
              </UButton>
            </div>
          </form>
        </div>
      </template>
    </UCard>
  </div>
</template>
