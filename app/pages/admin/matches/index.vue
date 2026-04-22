<script setup lang="ts">
import { getAdminApiErrorMessage, type AdminApiMeta } from "~/utils/admin-api";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

type MatchItem = {
  id: string;
  rentalAccessId: string;
  productId: string;
  matchType: string;
  sortOrder: number;
  note: string;
  updatedAt?: string;
  rentalAccessLabel: string;
  rentalAccessStatus: string;
  productLabel: string;
  productHidden: boolean;
};

type SelectOption = {
  value: string;
  label: string;
  status?: string;
  isHidden?: boolean;
};

const toast = useToast();

const form = reactive({
  rentalAccessId: "",
  productId: "",
  matchType: "compatible",
  sortOrder: 0,
  note: "",
});

const creating = ref(false);

const { data, pending, error, refresh } = await useFetch<{
  matches: MatchItem[];
  rentalAccessOptions: SelectOption[];
  productOptions: SelectOption[];
  meta?: AdminApiMeta;
}>("/api/admin/matches", {
  key: "admin-matches",
  default: () => ({
    matches: [],
    rentalAccessOptions: [],
    productOptions: [],
  }),
});

const matches = computed(() => data.value?.matches ?? []);
const rentalAccessOptions = computed(
  () => data.value?.rentalAccessOptions ?? [],
);
const productOptions = computed(() => data.value?.productOptions ?? []);
const adminMeta = computed(() => data.value?.meta ?? null);
const adminWarning = computed(() => adminMeta.value?.warning ?? null);
const isReadOnlyAdminMode = computed(
  () => adminMeta.value?.adminMode === "read_only",
);
const loadErrorMessage = computed(() =>
  getAdminApiErrorMessage(error.value, "Unknown admin matches error"),
);

watchEffect(() => {
  if (!form.rentalAccessId && rentalAccessOptions.value.length > 0) {
    form.rentalAccessId = rentalAccessOptions.value[0]!.value;
  }

  if (!form.productId && productOptions.value.length > 0) {
    form.productId = productOptions.value[0]!.value;
  }
});

function resetForm() {
  form.rentalAccessId = rentalAccessOptions.value[0]?.value ?? "";
  form.productId = productOptions.value[0]?.value ?? "";
  form.matchType = "compatible";
  form.sortOrder = 0;
  form.note = "";
}

async function createMatch() {
  if (isReadOnlyAdminMode.value) {
    toast.add({
      title: "Match create unavailable",
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
    await $fetch("/api/admin/matches", {
      method: "POST",
      body: {
        rentalAccessId: form.rentalAccessId,
        productId: form.productId,
        matchType: form.matchType,
        sortOrder: form.sortOrder,
        note: form.note,
      },
    });

    toast.add({
      title: "Match created",
      color: "success",
      icon: "bx:check-circle",
    });

    resetForm();
    await refresh();
  } catch (createError) {
    toast.add({
      title: "Create match failed",
      description: getAdminApiErrorMessage(createError, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    creating.value = false;
  }
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
            <h2 class="text-lg font-semibold">Matches</h2>
            <p class="text-sm text-muted">
              Link rental packages to products for storefront + booking
              compatibility.
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
        title="Failed to load matches"
        :description="loadErrorMessage"
      />

      <div v-if="pending" class="py-8 text-sm text-muted">
        Loading matches...
      </div>

      <div v-else-if="matches.length === 0" class="py-8 text-sm text-muted">
        No matches yet. Create the first link between a rental access and a
        product.
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="item in matches"
          :key="item.id"
          class="rounded-xl border border-default p-4"
        >
          <div
            class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
          >
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="font-medium">{{ item.rentalAccessLabel }}</h3>
                <UBadge
                  :color="
                    item.rentalAccessStatus === 'active'
                      ? 'success'
                      : item.rentalAccessStatus === 'archived'
                        ? 'neutral'
                        : 'warning'
                  "
                  variant="soft"
                >
                  {{ item.rentalAccessStatus }}
                </UBadge>
              </div>

              <p class="mt-2 text-sm text-muted">{{ item.productLabel }}</p>

              <p v-if="item.note" class="mt-2 text-sm text-muted">
                Note: {{ item.note }}
              </p>
            </div>

            <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <p class="text-muted">Type</p>
                <p class="font-medium">{{ item.matchType }}</p>
              </div>
              <div>
                <p class="text-muted">Sort order</p>
                <p class="font-medium">{{ item.sortOrder }}</p>
              </div>
              <div>
                <p class="text-muted">Product hidden</p>
                <p class="font-medium">
                  {{ item.productHidden ? "Yes" : "No" }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div>
          <h2 class="text-lg font-semibold">Create match</h2>
          <p class="text-sm text-muted">
            Minimal relation editor for `rental_access_matches`.
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

      <form class="space-y-4" @submit.prevent="createMatch">
        <UFormField label="Rental access" required>
          <USelectMenu
            v-model="form.rentalAccessId"
            :items="rentalAccessOptions"
            value-key="value"
          />
        </UFormField>

        <UFormField label="Product" required>
          <USelectMenu
            v-model="form.productId"
            :items="productOptions"
            value-key="value"
          />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Match type">
            <UInput v-model="form.matchType" placeholder="compatible" />
          </UFormField>

          <UFormField label="Sort order">
            <UInput v-model.number="form.sortOrder" type="number" min="0" />
          </UFormField>
        </div>

        <UFormField label="Note">
          <UTextarea v-model="form.note" :rows="3" />
        </UFormField>

        <div class="flex gap-2">
          <UButton
            type="submit"
            color="primary"
            :loading="creating"
            :disabled="
              isReadOnlyAdminMode || !form.rentalAccessId || !form.productId
            "
          >
            Create match
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
