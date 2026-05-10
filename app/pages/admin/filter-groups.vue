<script setup lang="ts">
import { getAdminApiErrorMessage, type AdminApiMeta } from "~/utils/admin-api";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["super_admin"],
});

type FilterType = "checkbox" | "dropdown" | "number_range";
type MatchLogic = "or" | "and";

type FilterOption = {
  id: string;
  groupId: string;
  key: string;
  labelTh: string;
  labelEn: string;
  isActive: boolean;
  sortOrder: number;
};

type FilterGroup = {
  id: string;
  mainCategoryKey: string;
  key: string;
  labelTh: string;
  labelEn: string;
  filterType: FilterType;
  matchLogic: MatchLogic;
  specKey: string | null;
  isActive: boolean;
  sortOrder: number;
  options: FilterOption[];
};

type MainCategoryOption = {
  key: string;
  labelEn: string;
  labelTh: string;
  isActive: boolean;
};

const toast = useToast();

const FILTER_TYPE_OPTIONS: { value: FilterType; label: string }[] = [
  { value: "checkbox", label: "Checkbox (multi-select)" },
  { value: "dropdown", label: "Dropdown (single-select)" },
  { value: "number_range", label: "Number range (min/max from spec)" },
];

const MATCH_LOGIC_OPTIONS: { value: MatchLogic; label: string }[] = [
  { value: "or", label: "OR — match any selected option" },
  { value: "and", label: "AND — match all selected options" },
];

// Sentinel used by the category filter dropdown to represent "no filter".
// Reka UI (Nuxt UI's Select primitive) forbids items with empty-string values.
const ALL_CATEGORIES_VALUE = "__all__";

const filterCategoryKey = ref<string>(ALL_CATEGORIES_VALUE);
const selectedGroupId = ref<string | null>(null);

const groupForm = reactive({
  id: "" as string,
  mainCategoryKey: "",
  key: "",
  labelTh: "",
  labelEn: "",
  filterType: "checkbox" as FilterType,
  matchLogic: "or" as MatchLogic,
  specKey: "",
  isActive: true,
  sortOrder: 0,
});

const optionForm = reactive({
  key: "",
  labelTh: "",
  labelEn: "",
  isActive: true,
  sortOrder: 0,
});

const editingOptionId = ref<string | null>(null);
const savingGroup = ref(false);
const deletingGroupId = ref<string | null>(null);
const savingOption = ref(false);
const deletingOptionId = ref<string | null>(null);

const { data: categoriesData } = await useFetch<{
  items: MainCategoryOption[];
}>("/api/admin/main-categories", {
  key: "admin-filter-groups-main-categories",
  default: () => ({ items: [] }),
});

const mainCategoryOptions = computed(() =>
  (categoriesData.value?.items ?? []).map((cat) => ({
    value: cat.key,
    label: `${cat.labelEn} (${cat.key})`,
  })),
);

const effectiveCategoryKey = computed(() =>
  filterCategoryKey.value === ALL_CATEGORIES_VALUE
    ? ""
    : filterCategoryKey.value,
);

const groupsQuery = computed(() =>
  effectiveCategoryKey.value
    ? { mainCategory: effectiveCategoryKey.value }
    : {},
);

const { data, pending, error, refresh } = await useFetch<{
  items: FilterGroup[];
  meta?: AdminApiMeta;
}>("/api/admin/filter-groups", {
  key: "admin-filter-groups",
  query: groupsQuery,
  default: () => ({ items: [] }),
  watch: [filterCategoryKey],
});

const groups = computed(() => data.value?.items ?? []);
const adminWarning = computed(() => data.value?.meta?.warning ?? null);
const loadErrorMessage = computed(() =>
  getAdminApiErrorMessage(error.value, "Unknown filter groups error"),
);

const selectedGroup = computed(
  () => groups.value.find((g) => g.id === selectedGroupId.value) ?? null,
);

const isEditing = computed(() => Boolean(selectedGroup.value));
const showOptionsEditor = computed(
  () =>
    isEditing.value &&
    groupForm.filterType !== "number_range" &&
    Boolean(selectedGroup.value),
);
const requiresSpecKey = computed(() => groupForm.filterType === "number_range");

function resetGroupForm() {
  selectedGroupId.value = null;
  groupForm.id = "";
  groupForm.mainCategoryKey = effectiveCategoryKey.value || "";
  groupForm.key = "";
  groupForm.labelTh = "";
  groupForm.labelEn = "";
  groupForm.filterType = "checkbox";
  groupForm.matchLogic = "or";
  groupForm.specKey = "";
  groupForm.isActive = true;
  groupForm.sortOrder = 0;
  resetOptionForm();
}

function resetOptionForm() {
  editingOptionId.value = null;
  optionForm.key = "";
  optionForm.labelTh = "";
  optionForm.labelEn = "";
  optionForm.isActive = true;
  optionForm.sortOrder = 0;
}

function selectGroup(group: FilterGroup) {
  selectedGroupId.value = group.id;
  groupForm.id = group.id;
  groupForm.mainCategoryKey = group.mainCategoryKey;
  groupForm.key = group.key;
  groupForm.labelTh = group.labelTh;
  groupForm.labelEn = group.labelEn;
  groupForm.filterType = group.filterType;
  groupForm.matchLogic = group.matchLogic;
  groupForm.specKey = group.specKey ?? "";
  groupForm.isActive = group.isActive;
  groupForm.sortOrder = group.sortOrder;
  resetOptionForm();
}

async function saveGroup() {
  savingGroup.value = true;

  try {
    const body = {
      mainCategoryKey: groupForm.mainCategoryKey,
      key: groupForm.key,
      labelTh: groupForm.labelTh,
      labelEn: groupForm.labelEn,
      filterType: groupForm.filterType,
      matchLogic: groupForm.matchLogic,
      specKey: groupForm.specKey || null,
      isActive: groupForm.isActive,
      sortOrder: groupForm.sortOrder,
    };

    if (isEditing.value) {
      await $fetch(`/api/admin/filter-groups/${groupForm.id}`, {
        method: "PATCH",
        body,
      });
    } else {
      const created = await $fetch<{ item: FilterGroup }>(
        "/api/admin/filter-groups",
        { method: "POST", body },
      );
      selectedGroupId.value = created.item.id;
    }

    toast.add({
      title: isEditing.value ? "Filter group updated" : "Filter group created",
      color: "success",
      icon: "bx:check-circle",
    });

    await refresh();
    if (selectedGroupId.value) {
      const fresh = data.value?.items.find(
        (g) => g.id === selectedGroupId.value,
      );
      if (fresh) selectGroup(fresh);
    }
  } catch (saveError) {
    toast.add({
      title: isEditing.value ? "Update failed" : "Create failed",
      description: getAdminApiErrorMessage(saveError, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    savingGroup.value = false;
  }
}

async function deleteGroup(group: FilterGroup) {
  if (
    import.meta.client &&
    !window.confirm(
      `Delete filter group '${group.labelEn || group.key}'? All its options and product assignments will be removed.`,
    )
  ) {
    return;
  }

  deletingGroupId.value = group.id;

  try {
    await $fetch(`/api/admin/filter-groups/${group.id}`, {
      method: "DELETE",
    });
    toast.add({
      title: "Filter group deleted",
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

function startEditOption(option: FilterOption) {
  editingOptionId.value = option.id;
  optionForm.key = option.key;
  optionForm.labelTh = option.labelTh;
  optionForm.labelEn = option.labelEn;
  optionForm.isActive = option.isActive;
  optionForm.sortOrder = option.sortOrder;
}

async function saveOption() {
  if (!selectedGroup.value) return;
  savingOption.value = true;

  try {
    const body = {
      key: optionForm.key,
      labelTh: optionForm.labelTh,
      labelEn: optionForm.labelEn,
      isActive: optionForm.isActive,
      sortOrder: optionForm.sortOrder,
    };

    if (editingOptionId.value) {
      await $fetch(
        `/api/admin/filter-groups/${selectedGroup.value.id}/options/${editingOptionId.value}`,
        { method: "PATCH", body },
      );
    } else {
      await $fetch(
        `/api/admin/filter-groups/${selectedGroup.value.id}/options`,
        { method: "POST", body },
      );
    }

    toast.add({
      title: editingOptionId.value ? "Option updated" : "Option created",
      color: "success",
      icon: "bx:check-circle",
    });
    resetOptionForm();
    await refresh();
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

async function deleteOption(option: FilterOption) {
  if (!selectedGroup.value) return;
  if (
    import.meta.client &&
    !window.confirm(
      `Delete option '${option.labelEn || option.key}'? Existing product assignments referencing it will be removed.`,
    )
  ) {
    return;
  }

  deletingOptionId.value = option.id;

  try {
    await $fetch(
      `/api/admin/filter-groups/${selectedGroup.value.id}/options/${option.id}`,
      { method: "DELETE" },
    );
    toast.add({
      title: "Option deleted",
      color: "success",
      icon: "bx:trash",
    });
    if (editingOptionId.value === option.id) resetOptionForm();
    await refresh();
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

watch(filterCategoryKey, (next) => {
  if (!isEditing.value) {
    groupForm.mainCategoryKey = next === ALL_CATEGORIES_VALUE ? "" : next;
  }
});
</script>

<template>
  <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,1fr)]">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold">Filter groups</h2>
            <p class="text-sm text-muted">
              Dynamic filters surfaced on /product-{group} per main category.
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
        title="Failed to load filter groups"
        :description="loadErrorMessage"
      />

      <div class="mb-4 flex flex-wrap items-end gap-3">
        <UFormField label="Main category" class="flex-1 min-w-55">
          <USelect
            v-model="filterCategoryKey"
            :items="[
              { value: ALL_CATEGORIES_VALUE, label: 'All categories' },
              ...mainCategoryOptions,
            ]"
            placeholder="All categories"
          />
        </UFormField>

        <UButton
          color="primary"
          variant="solid"
          size="sm"
          icon="bx:plus"
          @click="resetGroupForm"
        >
          New group
        </UButton>
      </div>

      <div v-if="pending" class="py-8 text-sm text-muted">
        Loading filter groups...
      </div>

      <div v-else-if="groups.length === 0" class="py-8 text-sm text-muted">
        No filter groups yet. Use the form on the right to create one.
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
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-medium">{{ group.labelEn }}</span>
                <UBadge color="neutral" variant="soft" size="xs">
                  {{ group.key }}
                </UBadge>
                <UBadge color="info" variant="soft" size="xs">
                  {{ group.filterType }}
                </UBadge>
                <UBadge
                  v-if="group.filterType !== 'number_range'"
                  color="neutral"
                  variant="outline"
                  size="xs"
                >
                  {{ group.matchLogic.toUpperCase() }}
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
                {{ group.mainCategoryKey }} ·
                {{ group.options.length }} option(s)
                <span v-if="group.specKey"> · spec: {{ group.specKey }}</span>
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
            {{ isEditing ? "Edit group" : "Create group" }}
          </h2>
          <p class="text-sm text-muted">
            {{
              isEditing
                ? "Update the group metadata. Renaming the key triggers a resync of products.filter_keys."
                : "Define the group's identifier, labels, type, and category."
            }}
          </p>
        </div>
      </template>

      <form class="space-y-4" @submit.prevent="saveGroup">
        <UAlert
          v-if="isEditing"
          color="warning"
          variant="soft"
          title="Editing existing group"
          description="Renaming the key updates products.filter_keys for every product in this group. Public URLs or bookmarks containing the old key will no longer match."
        />

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Main category" required>
            <USelect
              v-model="groupForm.mainCategoryKey"
              :items="mainCategoryOptions"
              placeholder="Select a main category"
            />
          </UFormField>

          <UFormField label="Sort order">
            <UInput
              v-model.number="groupForm.sortOrder"
              class="w-full"
              type="number"
              min="0"
            />
          </UFormField>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Key" required>
            <UInput
              v-model="groupForm.key"
              class="w-full"
              placeholder="power_w"
            />
          </UFormField>

          <UFormField label="Filter type" required>
            <USelect
              v-model="groupForm.filterType"
              :items="FILTER_TYPE_OPTIONS"
            />
          </UFormField>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Label (TH)" required>
            <UInput
              v-model="groupForm.labelTh"
              class="w-full"
              placeholder="กำลังไฟ (W)"
            />
          </UFormField>
          <UFormField label="Label (EN)" required>
            <UInput
              v-model="groupForm.labelEn"
              class="w-full"
              placeholder="Power (W)"
            />
          </UFormField>
        </div>

        <UFormField
          v-if="!requiresSpecKey"
          label="Match logic"
          help="Logic between options selected within this group."
        >
          <USelect
            v-model="groupForm.matchLogic"
            :items="MATCH_LOGIC_OPTIONS"
          />
        </UFormField>

        <UFormField
          v-if="requiresSpecKey"
          label="Spec key"
          required
          help="Reads numeric value from products.spec[specKey] for min/max filtering."
        >
          <UInput
            v-model="groupForm.specKey"
            class="w-full"
            placeholder="power_w"
          />
        </UFormField>

        <UCheckbox v-model="groupForm.isActive" label="Active" />

        <div class="flex gap-2">
          <UButton type="submit" color="primary" :loading="savingGroup">
            {{ isEditing ? "Save group" : "Create group" }}
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

      <template v-if="showOptionsEditor">
        <USeparator class="my-6" />

        <div class="space-y-4">
          <div>
            <h3 class="text-base font-semibold">Options</h3>
            <p class="text-sm text-muted">
              Manage selectable values for this group. Renaming an option key
              triggers a resync of products.filter_keys.
            </p>
          </div>

          <div
            v-if="selectedGroup && selectedGroup.options.length > 0"
            class="space-y-2"
          >
            <div
              v-for="opt in selectedGroup.options"
              :key="opt.id"
              class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-default p-3"
            >
              <div class="space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-medium">{{ opt.labelEn }}</span>
                  <UBadge color="neutral" variant="soft" size="xs">
                    {{ opt.key }}
                  </UBadge>
                  <UBadge
                    :color="opt.isActive ? 'success' : 'warning'"
                    variant="soft"
                    size="xs"
                  >
                    {{ opt.isActive ? "active" : "inactive" }}
                  </UBadge>
                </div>
                <p class="text-xs text-muted">
                  {{ opt.labelTh }} · sort {{ opt.sortOrder }}
                </p>
              </div>

              <div class="flex gap-2">
                <UButton
                  color="primary"
                  variant="soft"
                  size="xs"
                  icon="bx:edit"
                  @click="startEditOption(opt)"
                >
                  Edit
                </UButton>
                <UButton
                  color="error"
                  variant="soft"
                  size="xs"
                  icon="bx:trash"
                  :loading="deletingOptionId === opt.id"
                  @click="deleteOption(opt)"
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
            No options yet. Use the form below to add the first option.
          </p>

          <form
            class="space-y-3 rounded-xl bg-(--ui-bg-elevated)/50 p-3"
            @submit.prevent="saveOption"
          >
            <p class="text-sm font-medium">
              {{ editingOptionId ? "Edit option" : "Add option" }}
            </p>

            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="Key" required>
                <UInput
                  v-model="optionForm.key"
                  class="w-full"
                  placeholder="10w"
                />
              </UFormField>
              <UFormField label="Sort order">
                <UInput
                  v-model.number="optionForm.sortOrder"
                  class="w-full"
                  type="number"
                  min="0"
                />
              </UFormField>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="Label (TH)" required>
                <UInput
                  v-model="optionForm.labelTh"
                  class="w-full"
                  placeholder="10W"
                />
              </UFormField>
              <UFormField label="Label (EN)" required>
                <UInput
                  v-model="optionForm.labelEn"
                  class="w-full"
                  placeholder="10 Watts"
                />
              </UFormField>
            </div>

            <UCheckbox v-model="optionForm.isActive" label="Active" />

            <div class="flex gap-2">
              <UButton
                type="submit"
                color="primary"
                size="sm"
                :loading="savingOption"
              >
                {{ editingOptionId ? "Save option" : "Add option" }}
              </UButton>
              <UButton
                v-if="editingOptionId"
                type="button"
                variant="soft"
                color="neutral"
                size="sm"
                @click="resetOptionForm"
              >
                Cancel
              </UButton>
            </div>
          </form>
        </div>
      </template>

      <UAlert
        v-else-if="isEditing && requiresSpecKey"
        class="mt-6"
        color="info"
        variant="soft"
        title="Number range groups have no options"
        description="Min/max are derived from product spec values at runtime."
      />
    </UCard>
  </div>
</template>
