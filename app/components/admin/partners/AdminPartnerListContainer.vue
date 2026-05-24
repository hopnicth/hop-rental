<script setup lang="ts">
import { getAdminApiErrorMessage } from "~/utils/admin-api";
import type {
  AdminPartnerListItem,
  AdminPartnerListResponse,
} from "~/types/admin-partner";
import type { PartnerDirectoryType } from "~/types/partner";

// ── Types ──────────────────────────────────────────────────────────────────
type DirectoryTypeFilter = "all" | PartnerDirectoryType;
type BooleanFilter = "all" | "true" | "false";

// ── Router ─────────────────────────────────────────────────────────────────
const route = useRoute();
const router = useRouter();

// ── Filter state ────────────────────────────────────────────────────────────
const search = ref("");
const directoryType = ref<DirectoryTypeFilter>("all");
const isPublic = ref<BooleanFilter>("all");
const isVerified = ref<BooleanFilter>("all");
const page = ref(1); // 1-based for URL/UI; API uses 0-based
const pageSize = ref(20);

// ── Data state ──────────────────────────────────────────────────────────────
const partners = ref<AdminPartnerListItem[]>([]);
const total = ref(0);
const hasMore = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
const errorCode = ref<number | null>(null);
const hasLoadedOnce = ref(false);

// ── Filter options (hardcoded from locked enum) ─────────────────────────────
const directoryTypeOptions = [
  { label: "All types", value: "all" },
  { label: "Store", value: "store" },
  { label: "Service", value: "service" },
  { label: "Contractor", value: "contractor" },
];
const publicFilterOptions = [
  { label: "All", value: "all" },
  { label: "Public", value: "true" },
  { label: "Unpublished", value: "false" },
];
const verifiedFilterOptions = [
  { label: "All", value: "all" },
  { label: "Verified", value: "true" },
  { label: "Unverified", value: "false" },
];

// ── Computed ────────────────────────────────────────────────────────────────
const hasActiveFilters = computed(
  () =>
    search.value !== "" ||
    directoryType.value !== "all" ||
    isPublic.value !== "all" ||
    isVerified.value !== "all",
);
const visibleStart = computed(() =>
  total.value === 0 ? 0 : (page.value - 1) * pageSize.value + 1,
);
const visibleEnd = computed(() =>
  Math.min(
    total.value,
    (page.value - 1) * pageSize.value + partners.value.length,
  ),
);
const isAuthError = computed(
  () => errorCode.value === 401 || errorCode.value === 403,
);

// ── URL sync ────────────────────────────────────────────────────────────────
function initFromRoute() {
  const q = route.query;
  search.value = typeof q.search === "string" ? q.search : "";
  directoryType.value = (
    ["store", "service", "contractor"] as string[]
  ).includes(String(q.directoryType ?? ""))
    ? (q.directoryType as PartnerDirectoryType)
    : "all";
  isPublic.value =
    q.isPublic === "true" || q.isPublic === "false"
      ? (q.isPublic as BooleanFilter)
      : "all";
  isVerified.value =
    q.isVerified === "true" || q.isVerified === "false"
      ? (q.isVerified as BooleanFilter)
      : "all";
  page.value = Math.max(1, Number(q.page ?? 1));
}

function syncUrl() {
  const query: Record<string, string> = {};
  if (search.value) query.search = search.value;
  if (directoryType.value !== "all") query.directoryType = directoryType.value;
  if (isPublic.value !== "all") query.isPublic = isPublic.value;
  if (isVerified.value !== "all") query.isVerified = isVerified.value;
  if (page.value > 1) query.page = String(page.value);
  void router.replace({ query });
}

// ── Core fetch ───────────────────────────────────────────────────────────────
async function refreshPartners(targetPage = page.value) {
  loading.value = true;
  error.value = null;
  errorCode.value = null;
  try {
    const query: Record<string, string | number> = {
      page: targetPage - 1, // 1-based → 0-based
      pageSize: pageSize.value,
    };
    if (search.value) query.search = search.value;
    if (directoryType.value !== "all")
      query.directoryType = directoryType.value;
    if (isPublic.value !== "all") query.isPublic = isPublic.value;
    if (isVerified.value !== "all") query.isVerified = isVerified.value;

    const res = await $fetch<AdminPartnerListResponse>("/api/admin/partners", {
      query,
    });
    partners.value = res.items;
    total.value = res.total;
    hasMore.value = res.hasMore;
    page.value = res.page + 1; // 0-based → 1-based
    hasLoadedOnce.value = true;
  } catch (err) {
    error.value = getAdminApiErrorMessage(
      err,
      "Failed to load partner directory",
    );
    const status =
      (err as { statusCode?: number; status?: number })?.statusCode ??
      (err as { statusCode?: number; status?: number })?.status;
    errorCode.value = typeof status === "number" ? status : null;
  } finally {
    loading.value = false;
  }
}

// ── Filter / pagination actions ──────────────────────────────────────────────
function onFilterChange() {
  page.value = 1;
  syncUrl();
  void refreshPartners(1);
}
function onSearchSubmit() {
  page.value = 1;
  syncUrl();
  void refreshPartners(1);
}
function goToPage(newPage: number) {
  page.value = newPage;
  syncUrl();
  void refreshPartners(newPage);
}
function clearFilters() {
  search.value = "";
  directoryType.value = "all";
  isPublic.value = "all";
  isVerified.value = "all";
  page.value = 1;
  syncUrl();
  void refreshPartners(1);
}

// ── Display helpers ──────────────────────────────────────────────────────────
function formatDate(value: string) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("th-TH", { dateStyle: "medium" });
}
function directoryTypeColor(
  type: string,
): "primary" | "info" | "warning" | "neutral" {
  if (type === "store") return "primary";
  if (type === "service") return "info";
  if (type === "contractor") return "warning";
  return "neutral";
}
function directoryTypeLabel(type: string) {
  if (type === "store") return "Store";
  if (type === "service") return "Service";
  if (type === "contractor") return "Contractor";
  return type;
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(() => {
  initFromRoute();
  void refreshPartners();
});
</script>

<template>
  <div class="space-y-4">
    <!-- ── Header ──────────────────────────────────────────────────────── -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-primary">
          Partner Directory
        </p>
        <h2 class="text-2xl font-bold">Partners</h2>
        <p class="text-sm text-muted">
          จัดการร้านค้า บริการ และช่าง/ผู้รับเหมา
        </p>
      </div>
      <UButton
        icon="bx:refresh"
        variant="soft"
        color="primary"
        :loading="loading"
        @click="void refreshPartners()"
      >
        Refresh
      </UButton>
    </div>

    <!-- ── Filters ─────────────────────────────────────────────────────── -->
    <UCard>
      <div class="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_180px_180px_180px]">
        <UFormField label="Search">
          <UInput
            v-model="search"
            icon="bx:search"
            placeholder="Search by name or slug…"
            class="w-full"
            @keyup.enter="onSearchSubmit"
          />
        </UFormField>
        <UFormField label="Directory type">
          <USelectMenu
            v-model="directoryType"
            :items="directoryTypeOptions"
            value-key="value"
            class="w-full"
            @update:model-value="onFilterChange"
          />
        </UFormField>
        <UFormField label="Public status">
          <USelectMenu
            v-model="isPublic"
            :items="publicFilterOptions"
            value-key="value"
            class="w-full"
            @update:model-value="onFilterChange"
          />
        </UFormField>
        <UFormField label="Verified status">
          <USelectMenu
            v-model="isVerified"
            :items="verifiedFilterOptions"
            value-key="value"
            class="w-full"
            @update:model-value="onFilterChange"
          />
        </UFormField>
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        <UButton color="primary" :loading="loading" @click="onSearchSubmit">
          Search
        </UButton>
        <UButton
          v-if="hasActiveFilters"
          color="neutral"
          variant="ghost"
          @click="clearFilters"
        >
          Clear filters
        </UButton>
      </div>
    </UCard>

    <!-- ── Error state ─────────────────────────────────────────────────── -->
    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      :title="isAuthError ? 'Access denied' : 'Failed to load partners'"
      :description="
        isAuthError
          ? 'You do not have permission to view the partner directory. Contact a super admin.'
          : error
      "
    >
      <template v-if="!isAuthError" #actions>
        <UButton
          label="Retry"
          size="xs"
          color="error"
          variant="soft"
          @click="void refreshPartners()"
        />
      </template>
    </UAlert>

    <!-- ── List ────────────────────────────────────────────────────────── -->
    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="font-semibold">Partner list</p>
            <p class="text-xs text-muted">
              Showing {{ visibleStart }}–{{ visibleEnd }} of
              {{ total }} partners
            </p>
          </div>
          <UBadge
            v-if="loading && hasLoadedOnce"
            color="primary"
            variant="soft"
          >
            Updating…
          </UBadge>
        </div>
      </template>

      <!-- Loading skeleton (initial load only) -->
      <div v-if="loading && !hasLoadedOnce" class="space-y-3">
        <USkeleton v-for="i in 5" :key="i" class="h-14 w-full" />
      </div>

      <!-- Empty: no partners exist at all -->
      <div
        v-else-if="
          !loading &&
          hasLoadedOnce &&
          partners.length === 0 &&
          !hasActiveFilters
        "
        class="rounded-xl border border-dashed border-default py-12 text-center text-sm text-muted"
      >
        <p class="font-medium">No partners yet</p>
        <p class="mt-1 text-xs">
          No partner profiles have been created in the directory.
        </p>
      </div>

      <!-- Empty: filters returned no results -->
      <div
        v-else-if="
          !loading && hasLoadedOnce && partners.length === 0 && hasActiveFilters
        "
        class="rounded-xl border border-dashed border-default py-12 text-center text-sm text-muted"
      >
        <p class="font-medium">No results for current filters</p>
        <p class="mt-1 text-xs">Try adjusting or clearing the filters above.</p>
        <UButton
          class="mt-4"
          size="sm"
          variant="soft"
          color="neutral"
          @click="clearFilters"
        >
          Clear filters
        </UButton>
      </div>

      <!-- Table -->
      <div v-else-if="partners.length > 0" class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th class="py-2 pr-4">Partner</th>
              <th class="py-2 pr-4">Type</th>
              <th class="py-2 pr-4">Category</th>
              <th class="py-2 pr-4">Service areas</th>
              <th class="py-2 pr-4">Status</th>
              <th class="py-2">Updated</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr v-for="partner in partners" :key="partner.id" class="group">
              <!-- Name + slug -->
              <td class="py-3 pr-4 align-top">
                <p class="font-semibold">{{ partner.nameTh }}</p>
                <p v-if="partner.nameEn" class="text-xs text-muted">
                  {{ partner.nameEn }}
                </p>
                <p class="mt-0.5 font-mono text-xs text-muted">
                  /{{ partner.slug }}
                </p>
              </td>

              <!-- Directory type chip -->
              <td class="py-3 pr-4 align-top">
                <UBadge
                  :color="directoryTypeColor(partner.directoryType)"
                  variant="soft"
                  size="sm"
                >
                  {{ directoryTypeLabel(partner.directoryType) }}
                </UBadge>
              </td>

              <!-- Category key -->
              <td class="py-3 pr-4 align-top text-xs">
                <span v-if="partner.mainCategoryKey" class="text-default">
                  {{ partner.mainCategoryKey }}
                </span>
                <span v-else class="text-muted">—</span>
              </td>

              <!-- Service areas (max 2 chips + overflow count) -->
              <td class="py-3 pr-4 align-top">
                <div
                  v-if="partner.serviceAreas.length > 0"
                  class="flex flex-wrap gap-1"
                >
                  <UBadge
                    v-for="area in partner.serviceAreas.slice(0, 2)"
                    :key="area"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                  >
                    {{ area }}
                  </UBadge>
                  <UBadge
                    v-if="partner.serviceAreas.length > 2"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                  >
                    +{{ partner.serviceAreas.length - 2 }}
                  </UBadge>
                </div>
                <span v-else class="text-xs text-muted">—</span>
              </td>

              <!-- Public + verified status chips -->
              <td class="py-3 pr-4 align-top">
                <div class="flex flex-col gap-1">
                  <UBadge
                    :color="partner.isPublic ? 'success' : 'neutral'"
                    variant="soft"
                    size="sm"
                  >
                    {{ partner.isPublic ? "Public" : "Unpublished" }}
                  </UBadge>
                  <UBadge
                    :color="partner.isVerified ? 'primary' : 'warning'"
                    variant="soft"
                    size="sm"
                  >
                    {{ partner.isVerified ? "Verified" : "Unverified" }}
                  </UBadge>
                  <UBadge
                    v-if="partner.isFeatured"
                    color="info"
                    variant="subtle"
                    size="sm"
                  >
                    Featured
                  </UBadge>
                </div>
              </td>

              <!-- Updated date -->
              <td class="py-3 align-top text-xs text-muted">
                {{ formatDate(partner.updatedAt) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div
        v-if="hasLoadedOnce && (partners.length > 0 || page > 1)"
        class="mt-4 flex flex-wrap items-center justify-between gap-2"
      >
        <p class="text-xs text-muted">Page {{ page }} · {{ total }} total</p>
        <div class="flex gap-2">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            :disabled="page <= 1 || loading"
            @click="goToPage(page - 1)"
          >
            Previous
          </UButton>
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            :disabled="!hasMore || loading"
            @click="goToPage(page + 1)"
          >
            Next
          </UButton>
        </div>
      </div>
    </UCard>
  </div>
</template>
