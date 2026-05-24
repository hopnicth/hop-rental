<script setup lang="ts">
import { getAdminApiErrorMessage } from "~/utils/admin-api";
import type {
  PartnerDirectoryType,
  PartnerEntityType,
  PartnerBusinessHoursPresetKey,
} from "~/types/partner";
import { SERVICE_AREA_OPTIONS } from "~/data/thaiServiceAreas";

// ── Router / toast ──────────────────────────────────────────────────────────
const route = useRoute();
const toast = useToast();

const backTo = computed(() => {
  const q = route.query.returnTo;
  return typeof q === "string" && q.startsWith("/admin/")
    ? q
    : "/admin/partners";
});

// ── Category constants (seeded by migration 097) ───────────────────────────
// Using local constants because asMainCategoryEntityType() does not support
// 'partner' entity type — the existing admin API would silently fall back to
// the 'product' entity filter. No new API was added.
type SelectOption = { value: string; label: string };

const ALL_CATEGORIES: SelectOption[] = [
  // store_* (7)
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
  // service_* (6)
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
  // contractor_* (7)
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

// ── Service area options (reused from thaiServiceAreas.ts vocabulary) ──────
const serviceAreaItems = SERVICE_AREA_OPTIONS.map((opt) => ({
  value: opt.value,
  label: `${opt.labelTh} (${opt.labelEn})`,
}));

// ── Business hours preset options ────────────────────────────────────────
/**
 * Sentinel values for non-preset states. ASCII-only — safe from Thai text
 * encoding issues and stable regardless of locale.
 * These values are used in form.businessHoursPreset only; never sent to API.
 */
const BH_UNSET = "unset" as const;
const BH_CUSTOM = "custom" as const;

/**
 * Dropdown options. `value` is machine-readable (preset key or sentinel).
 * `label` is the Thai display text shown in the UI.
 * Preset option values match the DB CHECK constraint keys from migration 098.
 */
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

/**
 * Thai display text for each machine-readable preset key.
 * Used to populate businessHoursText on submit — display-only, never parsed.
 */
const BH_DISPLAY_TEXT: Record<string, string> = {
  everyday_0900_1800: "ทุกวัน 09:00-18:00",
  mon_fri_0900_1800: "จันทร์-ศุกร์ 09:00-18:00",
  mon_sat_0900_1800: "จันทร์-เสาร์ 09:00-18:00",
  sat_sun_0900_1800: "เสาร์-อาทิตย์ 09:00-18:00",
  open_24h: "เปิด 24 ชั่วโมง",
  by_appointment: "ตามนัดหมาย",
};

// ── Form state ────────────────────────────────────────────────────────────
const form = reactive({
  nameTh: "",
  nameEn: "",
  slug: "",
  directoryType: "" as PartnerDirectoryType | "",
  entityType: "" as PartnerEntityType | "",
  mainCategoryKey: "",
  shortDescription: "",
  serviceAreas: [] as string[],
  businessHoursPreset: BH_UNSET as string,
  businessHoursCustom: "",
  isPublic: false,
});

const slugTouched = ref(false);
const submitting = ref(false);
const submitError = ref<string | null>(null);
const fieldErrors = reactive<Record<string, string | null>>({});

// ── Computed ──────────────────────────────────────────────────────────────
const filteredCategoryOptions = computed((): SelectOption[] => {
  if (!form.directoryType) return [];
  const prefix = `${form.directoryType}_`;
  return ALL_CATEGORIES.filter((c) => c.value.startsWith(prefix));
});

// Resolves the Thai display text to submit as businessHoursText.
// "unset"  → "" (API asOptionalString will store null)
// "custom" → trimmed free-text input
// any preset key → Thai label from BH_DISPLAY_TEXT
const effectiveBusinessHoursText = computed(() => {
  if (form.businessHoursPreset === BH_UNSET) return "";
  if (form.businessHoursPreset === BH_CUSTOM)
    return form.businessHoursCustom.trim();
  return BH_DISPLAY_TEXT[form.businessHoursPreset] ?? "";
});

/**
 * Machine-readable preset key to submit alongside businessHoursText.
 * For preset options the form value IS the key — no secondary map needed.
 * "unset" and "custom" sentinels both yield null (excluded from Open Now).
 */
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

const canSubmit = computed(
  () =>
    !submitting.value &&
    form.nameTh.trim().length > 0 &&
    form.slug.trim().length > 0 &&
    Boolean(form.directoryType) &&
    Boolean(form.entityType) &&
    Boolean(form.mainCategoryKey),
);

// ── Watchers ──────────────────────────────────────────────────────────────
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

// Auto-generate slug from name if admin has not manually edited it
watch(
  () => [form.nameTh, form.nameEn] as const,
  () => {
    if (!slugTouched.value) {
      const generated = slugifySegment(form.nameEn.trim() || form.nameTh);
      if (generated) {
        form.slug = generated;
        fieldErrors.slug = null;
      }
    }
  },
);

// ── Slug helpers ──────────────────────────────────────────────────────────
function slugifySegment(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 60);
}

function generateSlug() {
  const generated = slugifySegment(form.nameEn.trim() || form.nameTh);
  if (generated) {
    form.slug = generated;
    slugTouched.value = false;
    fieldErrors.slug = null;
  }
}

// ── Validation ────────────────────────────────────────────────────────────
function validate(): boolean {
  fieldErrors.nameTh = form.nameTh.trim() ? null : "Thai name is required";
  fieldErrors.slug = form.slug.trim() ? null : "Slug is required";
  fieldErrors.directoryType = form.directoryType
    ? null
    : "Directory type is required";
  fieldErrors.entityType = form.entityType ? null : "Entity type is required";
  if (!form.mainCategoryKey) {
    fieldErrors.mainCategoryKey = "Category is required";
  } else if (
    form.directoryType &&
    !form.mainCategoryKey.startsWith(`${form.directoryType}_`)
  ) {
    fieldErrors.mainCategoryKey =
      "Category does not match the selected directory type";
  } else {
    fieldErrors.mainCategoryKey = null;
  }
  return !Object.values(fieldErrors).some(Boolean);
}

// ── Submit ────────────────────────────────────────────────────────────────
async function handleSubmit() {
  submitError.value = null;
  if (!validate()) return;
  submitting.value = true;
  try {
    const cleanServiceAreas = form.serviceAreas
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const body: Record<string, unknown> = {
      nameTh: form.nameTh.trim(),
      slug: form.slug.trim(),
      directoryType: form.directoryType,
      entityType: form.entityType,
      serviceAreas: cleanServiceAreas,
      isPublic: form.isPublic,
    };
    if (form.nameEn.trim()) body.nameEn = form.nameEn.trim();
    if (form.mainCategoryKey) body.mainCategoryKey = form.mainCategoryKey;
    if (form.shortDescription.trim())
      body.taglineTh = form.shortDescription.trim();
    if (effectiveBusinessHoursText.value)
      body.businessHoursText = effectiveBusinessHoursText.value;
    // Always submit the preset key (null is valid — clears any existing value).
    body.businessHoursPresetKey = effectiveBusinessHoursPresetKey.value;

    const data = await $fetch<{ item: { slug: string } }>(
      "/api/admin/partners",
      {
        method: "POST",
        body,
      },
    );

    toast.add({
      title: "Partner created",
      description: `/${data.item.slug}`,
      color: "success",
      icon: "bx:check-circle",
    });
    await navigateTo(
      `/admin/partners?search=${encodeURIComponent(data.item.slug)}`,
    );
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    const message = getAdminApiErrorMessage(err, "Failed to create partner");
    if (status === 409) fieldErrors.slug = message;
    else if (status === 403)
      submitError.value = "You do not have permission to create partners.";
    else submitError.value = message;
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- ── Header ──────────────────────────────────────────────────────── -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-primary">
          Partner Directory
        </p>
        <h2 class="text-2xl font-bold">เพิ่ม Partner</h2>
        <p class="text-sm text-muted">
          สร้างร้านค้า บริการ หรือช่าง/ผู้รับเหมา
        </p>
      </div>
      <UButton :to="backTo" icon="bx:arrow-back" variant="soft" color="neutral">
        Back to list
      </UButton>
    </div>

    <!-- ── Basic Info Form ─────────────────────────────────────────────── -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="bx:info-circle" class="text-lg text-primary" />
          <p class="font-semibold">Basic information</p>
        </div>
      </template>

      <div class="space-y-4">
        <!-- Submit-level error -->
        <UAlert
          v-if="submitError"
          color="error"
          variant="soft"
          :title="submitError"
          icon="bx:error-circle"
        />

        <!-- nameTh -->
        <UFormField
          label="ชื่อภาษาไทย (Thai name)"
          required
          :error="fieldErrors.nameTh || undefined"
        >
          <UInput
            v-model="form.nameTh"
            class="w-full"
            placeholder="เช่น ร้านวัสดุก่อสร้างสมใจ"
            :disabled="submitting"
            @input="fieldErrors.nameTh = null"
          />
        </UFormField>

        <!-- nameEn -->
        <UFormField label="ชื่อภาษาอังกฤษ (English name)">
          <UInput
            v-model="form.nameEn"
            class="w-full"
            placeholder="e.g. Somjai Construction Materials"
            :disabled="submitting"
          />
        </UFormField>

        <!-- slug + generate button -->
        <UFormField
          label="Slug"
          required
          :error="fieldErrors.slug || undefined"
        >
          <div class="flex gap-2">
            <UInput
              v-model="form.slug"
              class="min-w-0 flex-1 font-mono"
              placeholder="e.g. somjai-construction"
              :disabled="submitting"
              @input="
                slugTouched = true;
                fieldErrors.slug = null;
              "
            />
            <UButton
              type="button"
              variant="soft"
              color="neutral"
              icon="bx:refresh"
              :disabled="submitting"
              @click="generateSlug"
            >
              Generate
            </UButton>
          </div>
          <template #hint>
            Lowercase, numbers, hyphens only.
            {{
              slugTouched
                ? "Editing manually — click Generate to reset."
                : "Auto-generated from name."
            }}
          </template>
        </UFormField>

        <!-- directoryType -->
        <UFormField
          label="Directory type"
          required
          :error="fieldErrors.directoryType || undefined"
        >
          <USelectMenu
            v-model="form.directoryType"
            :items="directoryTypeOptions"
            value-key="value"
            placeholder="Select directory type…"
            class="w-full"
            :disabled="submitting"
            @update:model-value="fieldErrors.directoryType = null"
          />
        </UFormField>

        <!-- entityType -->
        <UFormField
          label="Entity type"
          required
          :error="fieldErrors.entityType || undefined"
        >
          <USelectMenu
            v-model="form.entityType"
            :items="entityTypeOptions"
            value-key="value"
            placeholder="Select entity type…"
            class="w-full"
            :disabled="submitting"
            @update:model-value="fieldErrors.entityType = null"
          />
        </UFormField>

        <!-- mainCategoryKey — filtered by directoryType prefix -->
        <UFormField
          label="Category"
          required
          :error="fieldErrors.mainCategoryKey || undefined"
        >
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
            :disabled="submitting || !form.directoryType"
            @update:model-value="fieldErrors.mainCategoryKey = null"
          />
        </UFormField>

        <!-- shortDescription (tagline_th) -->
        <UFormField label="Short Description">
          <UInput
            v-model="form.shortDescription"
            class="w-full"
            placeholder="e.g. จำหน่ายวัสดุก่อสร้างราคาส่ง บริการทั่วกรุงเทพฯ"
            :disabled="submitting"
          />
          <template #hint> แสดงใต้ชื่อ — 1 ประโยคสั้น ๆ (ไม่บังคับ) </template>
        </UFormField>

        <!-- serviceAreas — multi-select from standard province/region vocabulary -->
        <UFormField
          label="Service Areas (พื้นที่ให้บริการ)"
          hint="เลือกได้หลายจังหวัด/ภาค หรือเลือก ทั่วประเทศ"
        >
          <USelectMenu
            v-model="form.serviceAreas"
            :items="serviceAreaItems"
            value-key="value"
            multiple
            searchable
            placeholder="เลือกพื้นที่ให้บริการ"
            class="w-full"
            :disabled="submitting"
          />
        </UFormField>

        <!-- businessHoursText — preset dropdown + optional custom input -->
        <UFormField label="Business Hours (เวลาทำการ)">
          <div class="space-y-2">
            <USelectMenu
              v-model="form.businessHoursPreset"
              :items="businessHoursPresetOptions"
              value-key="value"
              class="w-full"
              :disabled="submitting"
            />
            <UInput
              v-if="form.businessHoursPreset === BH_CUSTOM"
              v-model="form.businessHoursCustom"
              class="w-full"
              placeholder="เช่น จันทร์-เสาร์ 09:00-20:00"
              :disabled="submitting"
            />
          </div>
          <template #hint>
            ข้อความเวลาทำการสำหรับแสดงบนหน้า public (ไม่บังคับ)
          </template>
        </UFormField>

        <!-- Visibility / is_public -->
        <UFormField label="Visibility">
          <div class="flex items-center gap-3">
            <USwitch
              v-model="form.isPublic"
              :disabled="submitting"
              :label="form.isPublic ? 'Public' : 'Draft / Private'"
            />
            <span class="text-sm text-muted">
              {{
                form.isPublic
                  ? "Partner will be visible on the public directory."
                  : "Partner is saved as a draft and hidden from the public directory."
              }}
            </span>
          </div>
        </UFormField>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            :to="backTo"
            variant="soft"
            color="neutral"
            :disabled="submitting"
          >
            Cancel
          </UButton>
          <UButton
            color="primary"
            icon="bx:plus"
            :loading="submitting"
            :disabled="!canSubmit"
            @click="handleSubmit"
          >
            Create Partner
          </UButton>
        </div>
      </template>
    </UCard>
  </div>
</template>
