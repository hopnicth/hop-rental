<script setup lang="ts">
import { getAdminApiErrorMessage } from "~/utils/admin-api";
import type { AdminPartnerRow } from "~/types/admin-partner";
import type {
  PartnerDirectoryType,
  PartnerEntityType,
  PartnerBusinessHoursPresetKey,
} from "~/types/partner";
import { SERVICE_AREA_OPTIONS } from "~/data/thaiServiceAreas";

// ── Router / toast ───────────────────────────────────────────────────────────
const route = useRoute();
const toast = useToast();
const partnerId = computed(() => route.params.id as string);

// ── Category constants ────────────────────────────────────────────────────────
type SelectOption = { value: string; label: string };
const ALL_CATEGORIES: SelectOption[] = [
  {
    value: "store_construction_materials",
    label: "ร้านวัสดุก่อสร้าง · Construction Materials",
  },
  {
    value: "store_hardware_tools",
    label: "ร้านฮาร์ดแวร์และเครื่องมือช่าง · Hardware & Tools",
  },
  {
    value: "store_electrical_lighting",
    label: "ร้านอุปกรณ์ไฟฟ้าและแสงสว่าง · Electrical & Lighting",
  },
  { value: "store_plumbing", label: "ร้านอุปกรณ์ประปา · Plumbing" },
  { value: "store_safety_ppe", label: "ร้านเซฟตี้และ PPE · Safety & PPE" },
  {
    value: "store_paints_chemicals",
    label: "ร้านสีและเคมีภัณฑ์ · Paints & Chemicals",
  },
  {
    value: "store_signage_print",
    label: "ร้านป้ายและสิ่งพิมพ์ · Signage & Print",
  },
  {
    value: "service_transport_logistics",
    label: "บริษัทขนส่งและรับจ้าง · Transport & Logistics",
  },
  {
    value: "service_heavy_machinery_rental",
    label: "เช่าเครื่องจักรหนัก · Heavy Machinery Rental",
  },
  {
    value: "service_waste_disposal",
    label: "รับทิ้งขยะและเศษวัสดุ · Waste Disposal",
  },
  {
    value: "service_site_facilities",
    label: "ที่พักและสิ่งอำนวยความสะดวก · Site Facilities",
  },
  {
    value: "service_design_consulting",
    label: "ออกแบบและที่ปรึกษา · Design & Consulting",
  },
  {
    value: "service_safety_services",
    label: "บริการด้านความปลอดภัย · Safety Services",
  },
  {
    value: "contractor_general",
    label: "ผู้รับเหมาหลัก / รับเหมาต่อเติม · General Contractor",
  },
  {
    value: "contractor_structural_masonry",
    label: "ช่างโครงสร้างและปูน · Structural & Masonry",
  },
  {
    value: "contractor_electrical_network",
    label: "ช่างไฟฟ้าและสื่อสาร · Electrical & Network",
  },
  {
    value: "contractor_plumbing_sanitary",
    label: "ช่างประปาและสุขาภิบาล · Plumbing & Sanitary",
  },
  {
    value: "contractor_roofing_steel_work",
    label: "ช่างหลังคาและโครงเหล็ก · Roofing & Steel Work",
  },
  {
    value: "contractor_finishing_work",
    label: "ช่างตกแต่งและเก็บงาน · Finishing Work",
  },
  { value: "contractor_general_labor", label: "คนงานทั่วไป · General Labor" },
];
const directoryTypeOptions: SelectOption[] = [
  { value: "store", label: "Store — ร้านค้า" },
  { value: "service", label: "Service — บริการ" },
  { value: "contractor", label: "Contractor — ช่าง/ผู้รับเหมา" },
];
const entityTypeOptions: SelectOption[] = [
  { value: "organization", label: "Organization — บริษัท/นิติบุคคล" },
  { value: "individual", label: "Individual — บุคคลธรรมดา" },
];
const serviceAreaItems = SERVICE_AREA_OPTIONS.map((opt) => ({
  value: opt.value,
  label: `${opt.labelTh} (${opt.labelEn})`,
}));

// ── Business hours preset options ─────────────────────────────────────────────
const BH_UNSET = "unset" as const;
const BH_CUSTOM = "custom" as const;
const businessHoursPresetOptions: SelectOption[] = [
  { value: BH_UNSET, label: "ไม่ระบุ (ไม่แสดงข้อมูล)" },
  { value: "everyday_0900_1800", label: "ทุกวัน 09:00-18:00" },
  { value: "mon_fri_0900_1800", label: "จันทร์-ศุกร์ 09:00-18:00" },
  { value: "mon_sat_0900_1800", label: "จันทร์-เสาร์ 09:00-18:00" },
  { value: "sat_sun_0900_1800", label: "เสาร์-อาทิตย์ 09:00-18:00" },
  { value: "open_24h", label: "เปิด 24 ชั่วโมง" },
  { value: "by_appointment", label: "ตามนัดหมาย" },
  { value: BH_CUSTOM, label: "กำหนดเอง (ระบุข้อความเอง)" },
];
const BH_DISPLAY_TEXT: Record<string, string> = {
  everyday_0900_1800: "ทุกวัน 09:00-18:00",
  mon_fri_0900_1800: "จันทร์-ศุกร์ 09:00-18:00",
  mon_sat_0900_1800: "จันทร์-เสาร์ 09:00-18:00",
  sat_sun_0900_1800: "เสาร์-อาทิตย์ 09:00-18:00",
  open_24h: "เปิด 24 ชั่วโมง",
  by_appointment: "ตามนัดหมาย",
};

// ── Page state ────────────────────────────────────────────────────────────────
const loading = ref(false);
const loadError = ref<string | null>(null);
const partner = ref<AdminPartnerRow | null>(null);

// ── Form state — Phase 1C-2C Basic Info scope only ───────────────────────────
// Out-of-scope fields (contact, descriptions, verification, notes) are read
// from partner.value for display only and never sent in the PATCH payload.
const form = reactive({
  nameTh: "",
  nameEn: "",
  slug: "",
  directoryType: "" as PartnerDirectoryType | "",
  entityType: "" as PartnerEntityType | "",
  mainCategoryKey: "",
  taglineTh: "",
  serviceAreas: [] as string[],
  businessHoursPreset: BH_UNSET as string,
  businessHoursCustom: "",
  isPublic: false,
});
const saving = ref(false);
const saveError = ref<string | null>(null);
const fieldErrors = reactive<Record<string, string | null>>({});

// ── Computed ──────────────────────────────────────────────────────────────────
const filteredCategoryOptions = computed((): SelectOption[] => {
  if (!form.directoryType) return [];
  const prefix = `${form.directoryType}_`;
  return ALL_CATEGORIES.filter((c) => c.value.startsWith(prefix));
});
const effectiveBusinessHoursText = computed(() => {
  if (form.businessHoursPreset === BH_UNSET) return "";
  if (form.businessHoursPreset === BH_CUSTOM)
    return form.businessHoursCustom.trim();
  return BH_DISPLAY_TEXT[form.businessHoursPreset] ?? "";
});
const effectiveBusinessHoursPresetKey = computed(
  (): PartnerBusinessHoursPresetKey | null => {
    if (
      form.businessHoursPreset === BH_UNSET ||
      form.businessHoursPreset === BH_CUSTOM
    )
      return null;
    return form.businessHoursPreset as PartnerBusinessHoursPresetKey;
  },
);
const canSave = computed(
  () =>
    !saving.value &&
    form.nameTh.trim().length > 0 &&
    form.slug.trim().length > 0 &&
    Boolean(form.directoryType) &&
    Boolean(form.entityType),
);

// ── Init form — Basic Info fields only ───────────────────────────────────────
function initFormFromPartner(row: AdminPartnerRow) {
  form.nameTh = row.nameTh;
  form.nameEn = row.nameEn ?? "";
  form.slug = row.slug;
  form.directoryType = row.directoryType;
  form.entityType = row.entityType;
  form.mainCategoryKey = row.mainCategoryKey ?? "";
  form.taglineTh = row.taglineTh ?? "";
  form.serviceAreas = [...row.serviceAreas];
  form.isPublic = row.isPublic;
  // Business hours — derive sentinel from stored data
  if (row.businessHoursPresetKey) {
    form.businessHoursPreset = row.businessHoursPresetKey;
    form.businessHoursCustom = "";
  } else if (row.businessHoursText) {
    form.businessHoursPreset = BH_CUSTOM;
    form.businessHoursCustom = row.businessHoursText;
  } else {
    form.businessHoursPreset = BH_UNSET;
    form.businessHoursCustom = "";
  }
}

// ── Fetch ─────────────────────────────────────────────────────────────────────
async function fetchPartner() {
  loading.value = true;
  loadError.value = null;
  try {
    const data = await $fetch<{ item: AdminPartnerRow }>(
      `/api/admin/partners/${partnerId.value}`,
    );
    partner.value = data.item;
    initFormFromPartner(data.item);
  } catch (err) {
    loadError.value = getAdminApiErrorMessage(err, "Failed to load partner");
  } finally {
    loading.value = false;
  }
}

// ── Watcher: directoryType change clears mismatched category ─────────────────
watch(
  () => form.directoryType,
  (newType) => {
    if (
      form.mainCategoryKey &&
      !form.mainCategoryKey.startsWith(`${newType}_`)
    ) {
      form.mainCategoryKey = "";
    }
  },
);

// ── Save — Basic Info fields only ────────────────────────────────────────────
// isVerified, verifiedNotes, internalNotes, KYC, media, isFeatured, sortOrder
// are intentionally excluded — deferred to a later verification/admin phase.
async function handleSave() {
  saveError.value = null;
  Object.keys(fieldErrors).forEach((k) => (fieldErrors[k] = null));
  saving.value = true;
  try {
    const body: Record<string, unknown> = {
      nameTh: form.nameTh.trim(),
      nameEn: form.nameEn.trim() || null,
      slug: form.slug.trim(),
      directoryType: form.directoryType,
      entityType: form.entityType,
      mainCategoryKey: form.mainCategoryKey || null,
      taglineTh: form.taglineTh.trim() || null,
      serviceAreas: form.serviceAreas.map((s) => s.trim()).filter(Boolean),
      businessHoursText: effectiveBusinessHoursText.value || null,
      businessHoursPresetKey: effectiveBusinessHoursPresetKey.value,
      isPublic: form.isPublic,
    };
    const data = await $fetch<{ item: AdminPartnerRow }>(
      `/api/admin/partners/${partnerId.value}`,
      { method: "PATCH", body },
    );
    partner.value = data.item;
    initFormFromPartner(data.item);
    toast.add({
      title: "Partner saved",
      description: `/${data.item.slug}`,
      color: "success",
      icon: "bx:check-circle",
    });
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    const message = getAdminApiErrorMessage(err, "Failed to save partner");
    if (status === 409) fieldErrors.slug = message;
    else if (status === 403)
      saveError.value = "You do not have permission to edit partners.";
    else saveError.value = message;
  } finally {
    saving.value = false;
  }
}

// ── Display helpers ───────────────────────────────────────────────────────────
function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("th-TH", { dateStyle: "medium" });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(() => {
  void fetchPartner();
});
</script>

<template>
  <div class="space-y-4">
    <!-- ── Loading skeleton ───────────────────────────────────────────── -->
    <div v-if="loading" class="space-y-3">
      <USkeleton class="h-16 w-full" />
      <USkeleton class="h-96 w-full" />
    </div>

    <!-- ── Load error ────────────────────────────────────────────────── -->
    <UAlert
      v-else-if="loadError"
      color="error"
      variant="soft"
      :title="loadError"
      icon="bx:error-circle"
    >
      <template #actions>
        <UButton
          label="Retry"
          size="xs"
          color="error"
          variant="soft"
          @click="void fetchPartner()"
        />
      </template>
    </UAlert>

    <!-- ── Loaded ─────────────────────────────────────────────────────── -->
    <template v-else-if="partner">
      <!-- Header -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-primary">
            Partner Directory
          </p>
          <h2 class="text-2xl font-bold">{{ partner.nameTh }}</h2>
          <p class="font-mono text-sm text-muted">/{{ partner.slug }}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            :color="partner.isPublic ? 'success' : 'neutral'"
            variant="soft"
          >
            {{ partner.isPublic ? "Public" : "Unpublished" }}
          </UBadge>
          <UBadge
            :color="partner.isVerified ? 'primary' : 'warning'"
            variant="soft"
          >
            {{ partner.isVerified ? "Verified" : "Unverified" }}
          </UBadge>
          <UButton
            to="/admin/partners"
            icon="bx:arrow-back"
            variant="soft"
            color="neutral"
          >
            Back to list
          </UButton>
        </div>
      </div>

      <!-- ── Basic info card ─────────────────────────────────────────── -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="bx:info-circle" class="text-lg text-primary" />
            <p class="font-semibold">Basic information</p>
          </div>
        </template>

        <div class="space-y-4">
          <UAlert
            v-if="saveError"
            color="error"
            variant="soft"
            :title="saveError"
            icon="bx:error-circle"
          />

          <UFormField
            label="ชื่อภาษาไทย (Thai name)"
            required
            :error="fieldErrors.nameTh || undefined"
          >
            <UInput
              v-model="form.nameTh"
              class="w-full"
              :disabled="saving"
              @input="fieldErrors.nameTh = null"
            />
          </UFormField>

          <UFormField label="ชื่อภาษาอังกฤษ (English name)">
            <UInput v-model="form.nameEn" class="w-full" :disabled="saving" />
          </UFormField>

          <UFormField
            label="Slug"
            required
            :error="fieldErrors.slug || undefined"
          >
            <UInput
              v-model="form.slug"
              class="w-full font-mono"
              :disabled="saving"
              @input="fieldErrors.slug = null"
            />
            <template #hint>Lowercase, numbers, hyphens only.</template>
          </UFormField>

          <UFormField label="Directory type" required>
            <USelectMenu
              v-model="form.directoryType"
              :items="directoryTypeOptions"
              value-key="value"
              class="w-full"
              :disabled="saving"
            />
          </UFormField>

          <UFormField label="Entity type" required>
            <USelectMenu
              v-model="form.entityType"
              :items="entityTypeOptions"
              value-key="value"
              class="w-full"
              :disabled="saving"
            />
          </UFormField>

          <UFormField label="Category">
            <USelectMenu
              v-model="form.mainCategoryKey"
              :items="filteredCategoryOptions"
              value-key="value"
              :placeholder="
                form.directoryType
                  ? 'Select category…'
                  : 'Select directory type first'
              "
              class="w-full"
              :disabled="saving || !form.directoryType"
            />
          </UFormField>

          <UFormField label="Short Description (tagline ไทย)">
            <UInput
              v-model="form.taglineTh"
              class="w-full"
              :disabled="saving"
              placeholder="1 ประโยคสั้น ๆ"
            />
            <template #hint>แสดงใต้ชื่อ — 1 ประโยคสั้น ๆ (ไม่บังคับ)</template>
          </UFormField>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              to="/admin/partners"
              variant="soft"
              color="neutral"
              :disabled="saving"
            >
              Back to list
            </UButton>
            <UButton
              color="primary"
              icon="bx:save"
              :loading="saving"
              :disabled="!canSave"
              @click="handleSave"
            >
              Save changes
            </UButton>
          </div>
        </template>
      </UCard>

      <!-- ── Contact & hours card ────────────────────────────────────── -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="bx:map-pin" class="text-lg text-primary" />
            <p class="font-semibold">Contact & Hours</p>
          </div>
        </template>

        <div class="space-y-4">
          <UFormField label="Service Areas (พื้นที่ให้บริการ)">
            <USelectMenu
              v-model="form.serviceAreas"
              :items="serviceAreaItems"
              value-key="value"
              multiple
              searchable
              placeholder="เลือกพื้นที่ให้บริการ"
              class="w-full"
              :disabled="saving"
            />
          </UFormField>

          <UFormField label="Business Hours (เวลาทำการ)">
            <div class="space-y-2">
              <USelectMenu
                v-model="form.businessHoursPreset"
                :items="businessHoursPresetOptions"
                value-key="value"
                class="w-full"
                :disabled="saving"
              />
              <UInput
                v-if="form.businessHoursPreset === BH_CUSTOM"
                v-model="form.businessHoursCustom"
                class="w-full"
                placeholder="เช่น จันทร์-เสาร์ 09:00-20:00"
                :disabled="saving"
              />
            </div>
          </UFormField>
        </div>

        <template #footer>
          <div class="flex justify-end">
            <UButton
              color="primary"
              icon="bx:save"
              :loading="saving"
              :disabled="!canSave"
              @click="handleSave"
            >
              Save changes
            </UButton>
          </div>
        </template>
      </UCard>

      <!-- ── Visibility card — isPublic only (Phase 1C-2C scope) ─────── -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="bx:globe" class="text-lg text-primary" />
            <p class="font-semibold">Visibility</p>
          </div>
        </template>

        <UFormField label="Public status">
          <div class="flex items-center gap-3">
            <USwitch
              v-model="form.isPublic"
              :disabled="saving"
              :label="form.isPublic ? 'Public' : 'Draft / Private'"
            />
            <span class="text-sm text-muted">
              {{
                form.isPublic
                  ? "Visible on public directory."
                  : "Hidden from public directory."
              }}
            </span>
          </div>
        </UFormField>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              to="/admin/partners"
              variant="soft"
              color="neutral"
              :disabled="saving"
            >
              Back to list
            </UButton>
            <UButton
              color="primary"
              icon="bx:save"
              :loading="saving"
              :disabled="!canSave"
              @click="handleSave"
            >
              Save changes
            </UButton>
          </div>
        </template>
      </UCard>

      <!-- ── Metadata card ───────────────────────────────────────────── -->
      <UCard>
        <template #header>
          <p class="text-sm font-semibold text-muted">Metadata</p>
        </template>
        <div class="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p class="text-xs text-muted">ID</p>
            <p class="font-mono text-xs">{{ partner.id }}</p>
          </div>
          <div>
            <p class="text-xs text-muted">Slug</p>
            <p class="font-mono text-xs">{{ partner.slug }}</p>
          </div>
          <div>
            <p class="text-xs text-muted">Created</p>
            <p>{{ formatDate(partner.createdAt) }}</p>
          </div>
          <div>
            <p class="text-xs text-muted">Updated</p>
            <p>{{ formatDate(partner.updatedAt) }}</p>
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>
