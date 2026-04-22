<script setup lang="ts">
import { getAdminApiErrorMessage, type AdminApiMeta } from "~/utils/admin-api";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

type AdminRentalAccessListItem = {
  id: string;
  code: string;
  slug: string;
  status: "draft" | "active" | "archived";
  nameTh: string;
  nameEn: string;
  categoryKeys: string[];
  dailyRate: number;
  depositAmount: number;
  minRentalDays: number;
  isHidden: boolean;
  sortOrder: number;
  updatedAt?: string;
  matchCount: number;
};

const toast = useToast();

const formatter = new Intl.NumberFormat("th-TH");

const form = reactive({
  code: "",
  slug: "",
  status: "draft" as AdminRentalAccessListItem["status"],
  nameTh: "",
  nameEn: "",
  descriptionTh: "",
  descriptionEn: "",
  categoryKeysText: "rental, package",
  brand: "",
  thumbnailUrl: "",
  dailyRate: 0,
  depositAmount: 0,
  minRentalDays: 1,
  maxRentalDays: 0,
  bufferDays: 0,
  sortOrder: 0,
  isHidden: false,
});

const creating = ref(false);

const { data, pending, error, refresh } = await useFetch<{
  items: AdminRentalAccessListItem[];
  meta?: AdminApiMeta;
}>("/api/admin/rental-accesses", {
  key: "admin-rental-accesses",
  default: () => ({ items: [] }),
});

const items = computed(() => data.value?.items ?? []);
const adminMeta = computed(() => data.value?.meta ?? null);
const adminWarning = computed(() => adminMeta.value?.warning ?? null);
const isReadOnlyAdminMode = computed(
  () => adminMeta.value?.adminMode === "read_only",
);
const loadErrorMessage = computed(() =>
  getAdminApiErrorMessage(error.value, "Unknown admin rental access error"),
);

const statusOptions = [
  { label: "Draft", value: "draft" },
  { label: "Active", value: "active" },
  { label: "Archived", value: "archived" },
];

function resetForm() {
  form.code = "";
  form.slug = "";
  form.status = "draft";
  form.nameTh = "";
  form.nameEn = "";
  form.descriptionTh = "";
  form.descriptionEn = "";
  form.categoryKeysText = "rental, package";
  form.brand = "";
  form.thumbnailUrl = "";
  form.dailyRate = 0;
  form.depositAmount = 0;
  form.minRentalDays = 1;
  form.maxRentalDays = 0;
  form.bufferDays = 0;
  form.sortOrder = 0;
  form.isHidden = false;
}

function parseCategoryKeys(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

async function createRentalAccess() {
  if (isReadOnlyAdminMode.value) {
    toast.add({
      title: "Rental access create unavailable",
      description:
        adminWarning.value?.message ??
        "Admin write mode is unavailable right now.",
      color: "warning",
      icon: "bx:error-circle",
    });
    return;
  }

  creating.value = true;

  try {
    await $fetch("/api/admin/rental-accesses", {
      method: "POST",
      body: {
        code: form.code,
        slug: form.slug,
        status: form.status,
        nameTh: form.nameTh,
        nameEn: form.nameEn,
        descriptionTh: form.descriptionTh,
        descriptionEn: form.descriptionEn,
        categoryKeys: parseCategoryKeys(form.categoryKeysText),
        brand: form.brand,
        thumbnailUrl: form.thumbnailUrl,
        dailyRate: form.dailyRate,
        depositAmount: form.depositAmount,
        minRentalDays: form.minRentalDays,
        maxRentalDays: form.maxRentalDays,
        bufferDays: form.bufferDays,
        sortOrder: form.sortOrder,
        isHidden: form.isHidden,
      },
    });

    toast.add({
      title: "Rental access created",
      color: "success",
      icon: "bx:check-circle",
    });

    resetForm();
    await refresh();
  } catch (createError) {
    toast.add({
      title: "Create failed",
      description: getAdminApiErrorMessage(createError, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    creating.value = false;
  }
}

function formatCurrency(value: number): string {
  return formatter.format(value);
}
</script>

<template>
  <div class="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
    <UCard>
      <template #header>
        <div
          class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h2 class="text-lg font-semibold">Rental Accesses</h2>
            <p class="text-sm text-muted">
              Read + create MVP backed by `/api/admin/rental-accesses`.
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
        title="Failed to load rental accesses"
        :description="loadErrorMessage"
      />

      <div v-if="pending" class="py-8 text-sm text-muted">
        Loading rental accesses...
      </div>

      <div v-else-if="items.length === 0" class="py-8 text-sm text-muted">
        No rental access rows yet. Use the form to create the first package.
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="item in items"
          :key="item.id"
          class="rounded-xl border border-default p-4"
        >
          <div
            class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
          >
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="font-medium">{{ item.nameTh }}</h3>
                <UBadge
                  :color="
                    item.status === 'active'
                      ? 'success'
                      : item.status === 'archived'
                        ? 'neutral'
                        : 'warning'
                  "
                  variant="soft"
                >
                  {{ item.status }}
                </UBadge>
                <UBadge v-if="item.isHidden" color="neutral" variant="soft">
                  hidden
                </UBadge>
              </div>

              <p class="text-sm text-muted">
                {{ item.code }} · {{ item.slug }}
              </p>

              <p class="mt-2 text-sm text-muted">
                Categories: {{ item.categoryKeys.join(", ") || "—" }}
              </p>
            </div>

            <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <p class="text-muted">Daily</p>
                <p class="font-medium">฿{{ formatCurrency(item.dailyRate) }}</p>
              </div>
              <div>
                <p class="text-muted">Deposit</p>
                <p class="font-medium">
                  ฿{{ formatCurrency(item.depositAmount) }}
                </p>
              </div>
              <div>
                <p class="text-muted">Min days</p>
                <p class="font-medium">{{ item.minRentalDays }}</p>
              </div>
              <div>
                <p class="text-muted">Matches</p>
                <p class="font-medium">{{ item.matchCount }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div>
          <h2 class="text-lg font-semibold">Create rental access</h2>
          <p class="text-sm text-muted">
            Minimal fields only. Match editing and media gallery come next.
          </p>
        </div>
      </template>

      <UAlert
        v-if="adminWarning"
        class="mb-4"
        color="warning"
        variant="soft"
        title="Write actions are disabled"
        :description="adminWarning.message"
      />

      <form class="space-y-4" @submit.prevent="createRentalAccess">
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Code" required>
            <UInput v-model="form.code" placeholder="R-PKG-001" />
          </UFormField>

          <UFormField label="Slug" required>
            <UInput
              v-model="form.slug"
              placeholder="rent-electrician-package"
            />
          </UFormField>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Name (TH)" required>
            <UInput v-model="form.nameTh" />
          </UFormField>

          <UFormField label="Name (EN)" required>
            <UInput v-model="form.nameEn" />
          </UFormField>
        </div>

        <UFormField label="Description (TH)" required>
          <UTextarea v-model="form.descriptionTh" :rows="3" />
        </UFormField>

        <UFormField label="Description (EN)" required>
          <UTextarea v-model="form.descriptionEn" :rows="3" />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Status">
            <USelectMenu
              v-model="form.status"
              :items="statusOptions"
              value-key="value"
            />
          </UFormField>

          <UFormField label="Brand">
            <UInput v-model="form.brand" />
          </UFormField>
        </div>

        <UFormField label="Category keys (comma separated)">
          <UInput v-model="form.categoryKeysText" />
        </UFormField>

        <UFormField label="Thumbnail URL">
          <UInput v-model="form.thumbnailUrl" placeholder="https://..." />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Daily rate">
            <UInput v-model.number="form.dailyRate" type="number" min="0" />
          </UFormField>

          <UFormField label="Deposit amount">
            <UInput v-model.number="form.depositAmount" type="number" min="0" />
          </UFormField>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Min rental days">
            <UInput v-model.number="form.minRentalDays" type="number" min="1" />
          </UFormField>

          <UFormField label="Sort order">
            <UInput v-model.number="form.sortOrder" type="number" min="0" />
          </UFormField>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Max rental days (0 = no limit)">
            <UInput v-model.number="form.maxRentalDays" type="number" min="0" />
          </UFormField>

          <UFormField label="Buffer days">
            <UInput v-model.number="form.bufferDays" type="number" min="0" />
          </UFormField>
        </div>

        <UCheckbox
          v-model="form.isHidden"
          label="Hidden from public storefront"
        />

        <div class="flex gap-2">
          <UButton
            type="submit"
            color="primary"
            :loading="creating"
            :disabled="isReadOnlyAdminMode"
          >
            Create rental access
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
</template>
