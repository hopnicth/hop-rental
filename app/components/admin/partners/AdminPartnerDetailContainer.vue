<script setup lang="ts">
import { getAdminApiErrorMessage } from "~/utils/admin-api";
import type { AdminPartnerRow, AdminPartnerCategoryItem } from "~/types/admin-partner";
import type {
  PartnerDirectoryType,
  PartnerEntityType,
  PartnerBusinessHoursPresetKey,
  PartnerContentBlock,
} from "~/types/partner";
import { SERVICE_AREA_OPTIONS } from "~/data/thaiServiceAreas";

// ── Router / toast / i18n ────────────────────────────────────────────────────
const route = useRoute();
const toast = useToast();
const { t, te } = useI18n();
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

// ── Form state ───────────────────────────────────────────────────────────────
// Verification, KYC, and internal notes remain read-only display fields only.
const form = reactive({
  nameTh: "",
  nameEn: "",
  slug: "",
  directoryType: "" as PartnerDirectoryType | "",
  entityType: "" as PartnerEntityType | "",
  mainCategoryKey: "",
  secondaryCategoryKeys: [] as string[],
  searchKeywords: [] as string[],
  taglineTh: "",
  serviceAreas: [] as string[],
  businessHoursPreset: BH_UNSET as string,
  businessHoursCustom: "",
  isPublic: false,
  // ── FAB contact fields ────────────────────────────────────────────────────
  contactPhone: "",
  contactEmail: "",
  lineUrl: "",
  mapsUrl: "",
});

// Per-keyword constraints (internal search metadata; never shown publicly)
const SEARCH_KEYWORD_MAX_LEN = 50;
const SEARCH_KEYWORD_MAX_ITEMS = 20;
const saving = ref(false);
const saveError = ref<string | null>(null);
const fieldErrors = reactive<Record<string, string | null>>({});

// ── Computed ──────────────────────────────────────────────────────────────────
const filteredCategoryOptions = computed((): SelectOption[] => {
  if (!form.directoryType) return [];
  const prefix = `${form.directoryType}_`;
  return ALL_CATEGORIES.filter((c) => c.value.startsWith(prefix));
});

// Secondary options = same directoryType pool minus the current mainCategoryKey
const secondaryCategoryOptions = computed((): SelectOption[] =>
  filteredCategoryOptions.value.filter((c) => c.value !== form.mainCategoryKey),
);
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

// ── Init form ────────────────────────────────────────────────────────────────
function initFormFromPartner(row: AdminPartnerRow) {
  form.nameTh = row.nameTh;
  form.nameEn = row.nameEn ?? "";
  form.slug = row.slug;
  form.directoryType = row.directoryType;
  form.entityType = row.entityType;
  form.mainCategoryKey = row.mainCategoryKey ?? "";
  form.secondaryCategoryKeys = [...(row.secondaryCategoryKeys ?? [])];
  form.searchKeywords = [...(row.searchKeywords ?? [])];
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
  // FAB contact fields
  form.contactPhone = row.contactPhone ?? "";
  form.contactEmail = row.contactEmail ?? "";
  form.lineUrl = row.lineUrl ?? "";
  form.mapsUrl = row.mapsUrl ?? "";
  // Initialize taxonomy from partner response
  initTaxonomyFromPartner(row);
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
    // Drop any secondary keys that no longer match the new prefix
    if (form.secondaryCategoryKeys.length > 0) {
      const prefix = `${newType}_`;
      form.secondaryCategoryKeys = form.secondaryCategoryKeys.filter((k) =>
        k.startsWith(prefix),
      );
    }
  },
);

// Remove the newly-selected mainCategoryKey from secondaryCategoryKeys if present
watch(
  () => form.mainCategoryKey,
  (newMain) => {
    if (newMain && form.secondaryCategoryKeys.includes(newMain)) {
      form.secondaryCategoryKeys = form.secondaryCategoryKeys.filter(
        (k) => k !== newMain,
      );
    }
  },
);

// Sanitiser for free-text search keywords (trim, dedupe, length cap, item cap).
// AdminChipInput already trims/dedupes, but this enforces the per-item length
// constraint and acts as a defensive normaliser.
function setSearchKeywords(next: string[]) {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of next) {
    const v = (raw ?? "").trim();
    if (!v) continue;
    if (v.length > SEARCH_KEYWORD_MAX_LEN) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    cleaned.push(v);
    if (cleaned.length >= SEARCH_KEYWORD_MAX_ITEMS) break;
  }
  form.searchKeywords = cleaned;
}

// ── Save ─────────────────────────────────────────────────────────────────────
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
      secondaryCategoryKeys: [...form.secondaryCategoryKeys],
      searchKeywords: [...form.searchKeywords],
      taglineTh: form.taglineTh.trim() || null,
      serviceAreas: form.serviceAreas.map((s) => s.trim()).filter(Boolean),
      businessHoursText: effectiveBusinessHoursText.value || null,
      businessHoursPresetKey: effectiveBusinessHoursPresetKey.value,
      isPublic: form.isPublic,
      // FAB contact fields — empty string becomes null (asOptionalString on server)
      contactPhone: form.contactPhone.trim() || null,
      contactEmail: form.contactEmail.trim() || null,
      lineUrl: form.lineUrl.trim() || null,
      mapsUrl: form.mapsUrl.trim() || null,
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
  void loadTaxonomyCategories();
});

// ── Taxonomy (migration 116 + subcategories 117) ──────────────────────────────
const taxonomyCategories = ref<AdminPartnerCategoryItem[]>([]);
const taxonomyLoading = ref(false);
const taxonomySaving = ref(false);
const taxonomyPrimaryId = ref("");
const taxonomySecondaryIds = ref<string[]>([]);

function taxonomyLabel(slug: string): string {
  return te(`partners.categories.${slug}`)
    ? t(`partners.categories.${slug}`)
    : slug.replace(/_/g, " ");
}

// Primary options: level-0 categories only (the 8 top-level buckets)
const taxonomyPrimaryOptions = computed(() =>
  taxonomyCategories.value
    .filter((c) => c.level === 0)
    .map((c) => ({ value: c.id, label: taxonomyLabel(c.slug) })),
);

// Secondary options: level-1 categories that are children of the selected primary
const taxonomySecondaryOptions = computed(() => {
  if (!taxonomyPrimaryId.value) return [];
  return taxonomyCategories.value
    .filter((c) => c.level === 1 && c.parentId === taxonomyPrimaryId.value)
    .map((c) => ({ value: c.id, label: taxonomyLabel(c.slug) }));
});

// When primary changes, drop secondaries no longer valid under it.
// Guarded against the initial load race: skip while categories are not yet
// loaded so a partner that resolves before the category list does not get its
// saved secondaries pruned against an empty option set.
watch(taxonomyPrimaryId, () => {
  if (taxonomyCategories.value.length === 0) return;
  const validIds = new Set(taxonomySecondaryOptions.value.map((o) => o.value));
  taxonomySecondaryIds.value = taxonomySecondaryIds.value.filter((id) =>
    validIds.has(id),
  );
});

function initTaxonomyFromPartner(row: AdminPartnerRow) {
  const primary = row.taxonomyAssignments?.find((a) => a.isPrimary);
  const secondaries = row.taxonomyAssignments?.filter((a) => !a.isPrimary) ?? [];
  taxonomyPrimaryId.value = primary?.categoryId ?? "";
  taxonomySecondaryIds.value = secondaries.map((a) => a.categoryId);
}

async function loadTaxonomyCategories() {
  taxonomyLoading.value = true;
  try {
    const res = await $fetch<{ items: AdminPartnerCategoryItem[] }>(
      "/api/admin/partner-categories",
    );
    taxonomyCategories.value = res.items;
  } catch {
    // Non-blocking — taxonomy section remains empty if load fails
  } finally {
    taxonomyLoading.value = false;
  }
}

async function saveTaxonomy() {
  if (taxonomySaving.value) return;
  taxonomySaving.value = true;
  try {
    await $fetch(`/api/admin/partners/${partnerId.value}/category-assignments`, {
      method: "PUT",
      body: {
        primaryCategoryId: taxonomyPrimaryId.value || null,
        secondaryCategoryIds: taxonomySecondaryIds.value,
      },
    });
    toast.add({
      title: t("adminPartners.taxonomy.saveSuccess"),
      color: "success",
      icon: "bx:check-circle",
    });
  } catch (err) {
    toast.add({
      title: t("adminPartners.taxonomy.saveFailed"),
      description: getAdminApiErrorMessage(err, ""),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    taxonomySaving.value = false;
  }
}

// ── Partner Media ─────────────────────────────────────────────────────────────
const uploadingThumbnail = ref(false);
const uploadingCover = ref(false);
const removingThumbnail = ref(false);
const removingCover = ref(false);
const dragActiveThumbnail = ref(false);
const dragActiveCover = ref(false);

const thumbnailFileInput = ref<HTMLInputElement | null>(null);
const coverFileInput = ref<HTMLInputElement | null>(null);

const MEDIA_MAX_BYTES = 15 * 1024 * 1024;
const MEDIA_ACCEPT = "image/jpeg,image/png,image/webp";
const MEDIA_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function validateMediaFile(file: File): string | null {
  if (!MEDIA_ALLOWED_TYPES.includes(file.type)) {
    return "ไม่รองรับประเภทไฟล์นี้ กรุณาเลือก JPEG, PNG หรือ WebP";
  }
  if (file.size > MEDIA_MAX_BYTES) {
    return "ไฟล์ใหญ่เกิน 15 MB กรุณาเลือกไฟล์ที่มีขนาดไม่เกิน 15 MB";
  }
  return null;
}

async function uploadMediaFile(kind: "thumbnail" | "cover", file: File) {
  if (kind === "thumbnail") uploadingThumbnail.value = true;
  else uploadingCover.value = true;
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("kind", kind);
    const data = await $fetch<{ item: AdminPartnerRow }>(
      `/api/admin/partners/${partnerId.value}/media`,
      { method: "POST", body: formData },
    );
    partner.value = data.item;
    toast.add({
      title: "อัปโหลดสำเร็จ",
      description: kind === "thumbnail" ? "Thumbnail updated" : "Cover updated",
      color: "success",
      icon: "bx:check-circle",
    });
  } catch (err) {
    toast.add({
      title: "อัปโหลดล้มเหลว",
      description: getAdminApiErrorMessage(err, "Failed to upload image"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    if (kind === "thumbnail") uploadingThumbnail.value = false;
    else uploadingCover.value = false;
  }
}

function handleFileChange(kind: "thumbnail" | "cover", event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const validationError = validateMediaFile(file);
  if (validationError) {
    toast.add({
      title: "ไฟล์ไม่ถูกต้อง",
      description: validationError,
      color: "error",
      icon: "bx:error-circle",
    });
    return;
  }
  void uploadMediaFile(kind, file);
}

function handleDrop(kind: "thumbnail" | "cover", event: DragEvent) {
  if (kind === "thumbnail") dragActiveThumbnail.value = false;
  else dragActiveCover.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  const validationError = validateMediaFile(file);
  if (validationError) {
    toast.add({
      title: "ไฟล์ไม่ถูกต้อง",
      description: validationError,
      color: "error",
      icon: "bx:error-circle",
    });
    return;
  }
  void uploadMediaFile(kind, file);
}

async function handleMediaRemove(kind: "thumbnail" | "cover") {
  if (kind === "thumbnail") removingThumbnail.value = true;
  else removingCover.value = true;
  try {
    const data = await $fetch<{ item: AdminPartnerRow }>(
      `/api/admin/partners/${partnerId.value}/media`,
      { method: "DELETE", body: { kind } },
    );
    partner.value = data.item;
    toast.add({
      title: "ลบรูปภาพสำเร็จ",
      description: kind === "thumbnail" ? "Thumbnail removed" : "Cover removed",
      color: "success",
      icon: "bx:check-circle",
    });
  } catch (err) {
    toast.add({
      title: "ลบรูปภาพล้มเหลว",
      description: getAdminApiErrorMessage(err, "Failed to remove image"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    if (kind === "thumbnail") removingThumbnail.value = false;
    else removingCover.value = false;
  }
}

// ── Partner Content Blocks ────────────────────────────────────────────────────
const CONTENT_BLOCKS_MAX = 20;

const localContentBlocks = ref<PartnerContentBlock[]>([]);
const savingBlocks = ref(false);
const saveBlocksError = ref<string | null>(null);

/**
 * Dirty flag: true once the admin has made any local edit that has not yet
 * been persisted via Save Content Blocks.
 *
 * When true, the watcher on partner.value?.contentBlocks is suppressed so
 * that unrelated saves (Basic Info, Media upload/remove) do NOT overwrite
 * unsaved content block edits.
 */
const contentBlocksDirty = ref(false);

/**
 * Guard used inside the shallow watcher to prevent the subsequent deep
 * watcher from marking the array dirty immediately after a programmatic
 * sync.  Not reactive — intentional (must not trigger any watchers itself).
 */
let _blocksSyncing = false;

// Sync local copy from server whenever partner.value updates —
// but only if there are no unsaved local edits.
watch(
  () => partner.value?.contentBlocks,
  (blocks) => {
    if (contentBlocksDirty.value) return; // guard: preserve unsaved edits
    _blocksSyncing = true;
    localContentBlocks.value = blocks ? blocks.map((b) => ({ ...b })) : [];
    // Reset the sync flag after all queued watchers (including the deep
    // watcher below) have had a chance to run in the same flush.
    nextTick(() => {
      _blocksSyncing = false;
    });
  },
  { immediate: true },
);

// Mark dirty on any field mutation (v-model, visibility toggle, etc.)
// Suppressed during programmatic syncs via _blocksSyncing.
watch(
  localContentBlocks,
  () => {
    if (_blocksSyncing) return;
    contentBlocksDirty.value = true;
  },
  { deep: true },
);

function addBlock(type: PartnerContentBlock["type"]) {
  if (localContentBlocks.value.length >= CONTENT_BLOCKS_MAX) return;
  const id = crypto.randomUUID();
  if (type === "text") {
    localContentBlocks.value.push({
      id,
      type: "text",
      isVisible: true,
      body: "",
    });
  } else if (type === "drive_doc") {
    localContentBlocks.value.push({
      id,
      type: "drive_doc",
      isVisible: true,
      title: "",
      url: "",
      provider: "google_drive",
    });
  } else {
    localContentBlocks.value.push({
      id,
      type: "youtube",
      isVisible: true,
      url: "",
      videoId: "",
    });
  }
}

function moveBlock(index: number, dir: -1 | 1) {
  const arr = localContentBlocks.value;
  const target = index + dir;
  if (target < 0 || target >= arr.length) return;
  const [item] = arr.splice(index, 1);
  arr.splice(target, 0, item!);
}

function deleteBlock(index: number) {
  localContentBlocks.value.splice(index, 1);
}

async function saveContentBlocks() {
  saveBlocksError.value = null;
  savingBlocks.value = true;
  try {
    const data = await $fetch<{ item: AdminPartnerRow }>(
      `/api/admin/partners/${partnerId.value}/content-blocks`,
      { method: "PATCH", body: { contentBlocks: localContentBlocks.value } },
    );
    // Reset dirty BEFORE updating partner.value so the shallow watcher
    // will pick up the server-normalised blocks (e.g. extracted videoId).
    contentBlocksDirty.value = false;
    partner.value = data.item;
    toast.add({
      title: "เนื้อหาบันทึกสำเร็จ",
      description: `${data.item.contentBlocks.length} block(s) saved`,
      color: "success",
      icon: "bx:check-circle",
    });
  } catch (err) {
    saveBlocksError.value = getAdminApiErrorMessage(
      err,
      "Failed to save content blocks",
    );
  } finally {
    savingBlocks.value = false;
  }
}

// ── KYC Verification (Super Admin only) ──────────────────────────────────────
const { profile } = useUserProfile();
const isSuperAdmin = computed(
  () => profile.value?.platformRole === "super_admin",
);

const verificationStatus = computed((): "active" | "expired" | "unverified" => {
  if (!partner.value?.isVerified) return "unverified";
  if (partner.value.verifiedUntil) {
    const until = new Date(partner.value.verifiedUntil).getTime();
    if (!isNaN(until) && until <= Date.now()) return "expired";
  }
  return "active";
});

const stagedKycFiles = ref<File[]>([]);
const kycDropActive = ref(false);
const kycFileInput = ref<HTMLInputElement | null>(null);
const uploadingKyc = ref(false);
const verifying = ref(false);
const cancellingVerification = ref(false);

const KYC_MAX_BYTES = 20 * 1024 * 1024;
const KYC_ACCEPT = ".pdf,image/jpeg,image/png,image/webp";
const KYC_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

function validateKycFile(file: File): string | null {
  if (!KYC_ALLOWED_TYPES.includes(file.type))
    return "ไม่รองรับประเภทไฟล์นี้ กรุณาเลือก JPEG, PNG, WebP หรือ PDF";
  if (file.size > KYC_MAX_BYTES) return "ไฟล์ใหญ่เกิน 20 MB";
  return null;
}

function stageKycFiles(files: FileList | File[]) {
  for (const file of Array.from(files)) {
    const err = validateKycFile(file);
    if (err) {
      toast.add({
        title: "ไฟล์ไม่ถูกต้อง",
        description: err,
        color: "error",
        icon: "bx:error-circle",
      });
      continue;
    }
    stagedKycFiles.value.push(file);
  }
}

function handleKycFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  input.value = "";
  if (!files?.length) return;
  stageKycFiles(files);
}

function handleKycDrop(event: DragEvent) {
  kycDropActive.value = false;
  const files = event.dataTransfer?.files;
  if (!files?.length) return;
  stageKycFiles(files);
}

function removeKycStagedFile(index: number) {
  stagedKycFiles.value.splice(index, 1);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function uploadKycDocuments() {
  if (!stagedKycFiles.value.length || uploadingKyc.value) return;
  uploadingKyc.value = true;
  const files = [...stagedKycFiles.value];
  let successCount = 0;
  for (const file of files) {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const data = await $fetch<{ item: AdminPartnerRow }>(
        `/api/admin/partners/${partnerId.value}/verification-documents`,
        { method: "POST", body: formData },
      );
      partner.value = data.item;
      successCount++;
    } catch (err) {
      toast.add({
        title: "อัปโหลดล้มเหลว",
        description: getAdminApiErrorMessage(err, "Failed to upload document"),
        color: "error",
        icon: "bx:error-circle",
      });
    }
  }
  if (successCount > 0) {
    stagedKycFiles.value = [];
    toast.add({
      title: "อัปโหลดสำเร็จ",
      description: `${successCount} document(s) uploaded`,
      color: "success",
      icon: "bx:check-circle",
    });
  }
  uploadingKyc.value = false;
}

async function handleVerify() {
  if (verifying.value) return;
  verifying.value = true;
  try {
    const data = await $fetch<{ item: AdminPartnerRow }>(
      `/api/admin/partners/${partnerId.value}/verify`,
      { method: "POST" },
    );
    partner.value = data.item;
    toast.add({
      title: "ยืนยันตัวตนสำเร็จ",
      description: "Verified for 1 year",
      color: "success",
      icon: "bx:check-shield",
    });
  } catch (err) {
    toast.add({
      title: "ยืนยันตัวตนล้มเหลว",
      description: getAdminApiErrorMessage(err, "Failed to verify partner"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    verifying.value = false;
  }
}

async function handleVerifyCancel() {
  if (cancellingVerification.value) return;
  cancellingVerification.value = true;
  try {
    const data = await $fetch<{ item: AdminPartnerRow }>(
      `/api/admin/partners/${partnerId.value}/verify-cancel`,
      { method: "POST" },
    );
    partner.value = data.item;
    toast.add({
      title: "ยกเลิกการยืนยันสำเร็จ",
      description: "Verification cancelled",
      color: "success",
      icon: "bx:check-circle",
    });
  } catch (err) {
    toast.add({
      title: "ยกเลิกล้มเหลว",
      description: getAdminApiErrorMessage(
        err,
        "Failed to cancel verification",
      ),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    cancellingVerification.value = false;
  }
}
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

      <!-- ── Partner Media card ────────────────────────────────────────── -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="bx:image" class="text-lg text-primary" />
            <p class="font-semibold">Partner Media · รูปภาพพาร์ทเนอร์</p>
          </div>
        </template>

        <div class="grid gap-6 sm:grid-cols-2">
          <!-- ── Thumbnail panel ─────────────────────────────────────── -->
          <div class="space-y-3">
            <p class="text-sm font-medium">Thumbnail</p>

            <!-- Dropzone -->
            <div
              class="relative cursor-pointer select-none overflow-hidden rounded-lg border-2 border-dashed transition-colors"
              :class="
                dragActiveThumbnail
                  ? 'border-primary bg-primary/5 dark:bg-primary/10'
                  : 'border-neutral-300 bg-neutral-50 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600'
              "
              style="aspect-ratio: 1 / 1; min-height: 160px"
              role="button"
              tabindex="0"
              :aria-label="
                partner.thumbnailImageUrl
                  ? 'แทนที่รูป Thumbnail'
                  : 'เลือกรูป Thumbnail'
              "
              @click="
                !uploadingThumbnail &&
                !removingThumbnail &&
                thumbnailFileInput?.click()
              "
              @keydown.enter="
                !uploadingThumbnail &&
                !removingThumbnail &&
                thumbnailFileInput?.click()
              "
              @dragover.prevent
              @dragenter.prevent="dragActiveThumbnail = true"
              @dragleave="dragActiveThumbnail = false"
              @drop.prevent="handleDrop('thumbnail', $event as DragEvent)"
            >
              <!-- Preview image -->
              <img
                v-if="partner.thumbnailImageUrl"
                :src="partner.thumbnailImageUrl"
                alt="Thumbnail"
                class="pointer-events-none h-full w-full object-cover"
              />
              <!-- Empty placeholder -->
              <div
                v-else
                class="pointer-events-none flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-muted"
              >
                <UIcon name="bx:cloud-upload" class="text-4xl" />
                <p class="text-center text-sm font-medium">
                  วางไฟล์ที่นี่ หรือคลิกเพื่อเลือก
                </p>
              </div>
              <!-- Uploading overlay -->
              <div
                v-if="uploadingThumbnail"
                class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/40"
              >
                <UIcon
                  name="bx:loader-alt"
                  class="animate-spin text-4xl text-white"
                />
              </div>
              <!-- Drag-active overlay when image exists -->
              <div
                v-if="dragActiveThumbnail && partner.thumbnailImageUrl"
                class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-primary/30"
              >
                <p class="text-sm font-semibold text-white drop-shadow">
                  วางเพื่ออัปโหลด
                </p>
              </div>
            </div>

            <!-- Helper text -->
            <div class="space-y-0.5">
              <p class="text-xs text-muted">
                ใช้บนการ์ดรายการ · แนะนำรูปสี่เหลี่ยมจัตุรัส
              </p>
              <p class="text-xs text-muted">JPEG, PNG, WebP · ไม่เกิน 15 MB</p>
            </div>

            <!-- Remove (only when image exists) -->
            <div v-if="partner.thumbnailImageUrl">
              <UButton
                size="sm"
                color="error"
                variant="soft"
                icon="bx:trash"
                :loading="removingThumbnail"
                :disabled="uploadingThumbnail || removingThumbnail"
                @click="handleMediaRemove('thumbnail')"
              >
                Remove
              </UButton>
            </div>

            <!-- Hidden file input -->
            <input
              ref="thumbnailFileInput"
              type="file"
              :accept="MEDIA_ACCEPT"
              class="hidden"
              @change="handleFileChange('thumbnail', $event)"
            />
          </div>

          <!-- ── Cover panel ─────────────────────────────────────────── -->
          <div class="space-y-3">
            <p class="text-sm font-medium">Cover photo</p>

            <!-- Dropzone -->
            <div
              class="relative cursor-pointer select-none overflow-hidden rounded-lg border-2 border-dashed transition-colors"
              :class="
                dragActiveCover
                  ? 'border-primary bg-primary/5 dark:bg-primary/10'
                  : 'border-neutral-300 bg-neutral-50 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600'
              "
              style="aspect-ratio: 16 / 9; min-height: 120px"
              role="button"
              tabindex="0"
              :aria-label="
                partner.coverImageUrl ? 'แทนที่รูป Cover' : 'เลือกรูป Cover'
              "
              @click="
                !uploadingCover && !removingCover && coverFileInput?.click()
              "
              @keydown.enter="
                !uploadingCover && !removingCover && coverFileInput?.click()
              "
              @dragover.prevent
              @dragenter.prevent="dragActiveCover = true"
              @dragleave="dragActiveCover = false"
              @drop.prevent="handleDrop('cover', $event as DragEvent)"
            >
              <!-- Preview image -->
              <img
                v-if="partner.coverImageUrl"
                :src="partner.coverImageUrl"
                alt="Cover"
                class="pointer-events-none h-full w-full object-cover"
              />
              <!-- Empty placeholder -->
              <div
                v-else
                class="pointer-events-none flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-muted"
              >
                <UIcon name="bx:cloud-upload" class="text-4xl" />
                <p class="text-center text-sm font-medium">
                  วางไฟล์ที่นี่ หรือคลิกเพื่อเลือก
                </p>
              </div>
              <!-- Uploading overlay -->
              <div
                v-if="uploadingCover"
                class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/40"
              >
                <UIcon
                  name="bx:loader-alt"
                  class="animate-spin text-4xl text-white"
                />
              </div>
              <!-- Drag-active overlay when image exists -->
              <div
                v-if="dragActiveCover && partner.coverImageUrl"
                class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-primary/30"
              >
                <p class="text-sm font-semibold text-white drop-shadow">
                  วางเพื่ออัปโหลด
                </p>
              </div>
            </div>

            <!-- Helper text -->
            <div class="space-y-0.5">
              <p class="text-xs text-muted">
                ใช้เป็นรูปปกด้านในหน้า Detail · แนะนำรูปแนวนอน 16:9
              </p>
              <p class="text-xs text-muted">JPEG, PNG, WebP · ไม่เกิน 15 MB</p>
            </div>

            <!-- Remove (only when image exists) -->
            <div v-if="partner.coverImageUrl">
              <UButton
                size="sm"
                color="error"
                variant="soft"
                icon="bx:trash"
                :loading="removingCover"
                :disabled="uploadingCover || removingCover"
                @click="handleMediaRemove('cover')"
              >
                Remove
              </UButton>
            </div>

            <!-- Hidden file input -->
            <input
              ref="coverFileInput"
              type="file"
              :accept="MEDIA_ACCEPT"
              class="hidden"
              @change="handleFileChange('cover', $event)"
            />
          </div>
        </div>
      </UCard>

      <!-- ── Partner Content card ─────────────────────────────────────── -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="bx:list-ul" class="text-lg text-primary" />
            <p class="font-semibold">Partner Content · เนื้อหาหน้าพาร์ทเนอร์</p>
            <UBadge variant="soft" color="neutral" size="xs" class="ml-auto">
              {{ localContentBlocks.length }} / {{ CONTENT_BLOCKS_MAX }}
            </UBadge>
          </div>
        </template>

        <div class="space-y-4">
          <UAlert
            v-if="saveBlocksError"
            color="error"
            variant="soft"
            :title="saveBlocksError"
            icon="bx:error-circle"
          />

          <!-- Empty state -->
          <p v-if="localContentBlocks.length === 0" class="text-sm text-muted">
            ยังไม่มีเนื้อหา — คลิก "เพิ่มบล็อก" ด้านล่างเพื่อเริ่มต้น
          </p>

          <!-- Block list -->
          <div
            v-for="(block, idx) in localContentBlocks"
            :key="block.id"
            class="rounded-lg border p-4 space-y-3"
            :class="
              block.isVisible
                ? 'border-neutral-200 dark:border-neutral-700'
                : 'border-neutral-200 bg-neutral-50 opacity-60 dark:border-neutral-700 dark:bg-neutral-900'
            "
          >
            <!-- Block header row -->
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                variant="soft"
                :color="
                  block.type === 'text'
                    ? 'primary'
                    : block.type === 'drive_doc'
                      ? 'success'
                      : 'warning'
                "
                size="xs"
              >
                {{
                  block.type === "text"
                    ? "Text"
                    : block.type === "drive_doc"
                      ? "Drive Doc"
                      : "YouTube"
                }}
              </UBadge>
              <span class="text-xs text-muted font-mono">#{{ idx + 1 }}</span>
              <div class="ml-auto flex items-center gap-1">
                <UButton
                  size="xs"
                  :icon="block.isVisible ? 'bx:show' : 'bx:hide'"
                  variant="ghost"
                  :color="block.isVisible ? 'neutral' : 'warning'"
                  :title="block.isVisible ? 'ซ่อน' : 'แสดง'"
                  :disabled="savingBlocks"
                  @click="block.isVisible = !block.isVisible"
                />
                <UButton
                  size="xs"
                  icon="bx:up-arrow-alt"
                  variant="ghost"
                  color="neutral"
                  :disabled="idx === 0 || savingBlocks"
                  title="ขึ้น"
                  @click="moveBlock(idx, -1)"
                />
                <UButton
                  size="xs"
                  icon="bx:down-arrow-alt"
                  variant="ghost"
                  color="neutral"
                  :disabled="
                    idx === localContentBlocks.length - 1 || savingBlocks
                  "
                  title="ลง"
                  @click="moveBlock(idx, 1)"
                />
                <UButton
                  size="xs"
                  icon="bx:trash"
                  variant="ghost"
                  color="error"
                  :disabled="savingBlocks"
                  title="ลบ"
                  @click="deleteBlock(idx)"
                />
              </div>
            </div>

            <!-- Text block fields -->
            <template v-if="block.type === 'text'">
              <UFormField label="Title (optional)">
                <UInput
                  v-model="(block as any).title"
                  class="w-full"
                  placeholder="หัวข้อ (ไม่บังคับ)"
                  :disabled="savingBlocks"
                />
              </UFormField>
              <UFormField label="Body" required>
                <UTextarea
                  v-model="(block as any).body"
                  class="w-full"
                  :rows="4"
                  placeholder="เนื้อหา (ข้อความธรรมดาเท่านั้น ไม่รองรับ HTML)"
                  :disabled="savingBlocks"
                />
              </UFormField>
            </template>

            <!-- Drive Doc block fields -->
            <template v-else-if="block.type === 'drive_doc'">
              <UFormField label="Document Title" required>
                <UInput
                  v-model="(block as any).title"
                  class="w-full"
                  placeholder="ชื่อเอกสาร"
                  :disabled="savingBlocks"
                />
              </UFormField>
              <UFormField label="Google Drive / Docs URL" required>
                <UInput
                  v-model="(block as any).url"
                  class="w-full font-mono"
                  placeholder="https://drive.google.com/..."
                  :disabled="savingBlocks"
                />
              </UFormField>
            </template>

            <!-- YouTube block fields -->
            <template v-else-if="block.type === 'youtube'">
              <UFormField label="Video Title (optional)">
                <UInput
                  v-model="(block as any).title"
                  class="w-full"
                  placeholder="ชื่อวิดีโอ (ไม่บังคับ)"
                  :disabled="savingBlocks"
                />
              </UFormField>
              <UFormField label="YouTube URL" required>
                <UInput
                  v-model="(block as any).url"
                  class="w-full font-mono"
                  placeholder="https://www.youtube.com/watch?v=..."
                  :disabled="savingBlocks"
                />
              </UFormField>
            </template>
          </div>

          <!-- Add block buttons -->
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-xs text-muted mr-1">เพิ่มบล็อก:</p>
            <UButton
              size="sm"
              icon="bx:text"
              variant="soft"
              color="primary"
              :disabled="
                savingBlocks || localContentBlocks.length >= CONTENT_BLOCKS_MAX
              "
              @click="addBlock('text')"
            >
              Text
            </UButton>
            <UButton
              size="sm"
              icon="bx:file"
              variant="soft"
              color="success"
              :disabled="
                savingBlocks || localContentBlocks.length >= CONTENT_BLOCKS_MAX
              "
              @click="addBlock('drive_doc')"
            >
              Drive Doc
            </UButton>
            <UButton
              size="sm"
              icon="bx:play-circle"
              variant="soft"
              color="warning"
              :disabled="
                savingBlocks || localContentBlocks.length >= CONTENT_BLOCKS_MAX
              "
              @click="addBlock('youtube')"
            >
              YouTube
            </UButton>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end">
            <UButton
              color="primary"
              icon="bx:save"
              :loading="savingBlocks"
              :disabled="savingBlocks"
              @click="void saveContentBlocks()"
            >
              Save Content Blocks
            </UButton>
          </div>
        </template>
      </UCard>

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

          <UFormField label="Secondary categories (หมวดหมู่รอง)">
            <AdminChipInput
              :model-value="form.secondaryCategoryKeys"
              :options="secondaryCategoryOptions"
              :disabled="saving || !form.directoryType"
              placeholder="พิมพ์เพื่อค้นหาและเลือกหมวดหมู่รอง"
              empty-text="ไม่มีหมวดหมู่ที่ตรงกับคำค้น"
              @update:model-value="(v) => (form.secondaryCategoryKeys = v)"
            />
            <template #hint>
              เลือกได้หลายหมวด —
              ใช้สำหรับการค้นหาและการแสดงผลในหมวดที่เกี่ยวข้อง (ไม่บังคับ)
            </template>
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
          <!-- ── FAB contact fields ──────────────────────────────────────── -->
          <UFormField label="Phone / เบอร์โทร">
            <UInput
              v-model="form.contactPhone"
              class="w-full"
              placeholder="e.g. 02-123-4567 หรือ 081-234-5678"
              :disabled="saving"
            />
            <template #hint>
              ใช้สำหรับปุ่ม FAB โทรและการ์ด Contact (ไม่บังคับ)
            </template>
          </UFormField>

          <UFormField label="Email / อีเมล">
            <UInput
              v-model="form.contactEmail"
              type="email"
              class="w-full"
              placeholder="e.g. info@example.com"
              :disabled="saving"
            />
            <template #hint>
              ใช้สำหรับปุ่ม FAB อีเมลและการ์ด Contact (ไม่บังคับ)
            </template>
          </UFormField>

          <UFormField label="LINE URL / ลิงก์ LINE">
            <UInput
              v-model="form.lineUrl"
              class="w-full"
              placeholder="e.g. https://line.me/ti/p/~yourlineid หรือ https://lin.ee/xxxxx"
              :disabled="saving"
            />
            <template #hint>
              ใส่ URL เต็มเท่านั้น — รองรับ https://line.me/... และ
              https://lin.ee/... (ไม่บังคับ)
            </template>
          </UFormField>

          <UFormField label="Google Maps URL / ลิงก์ Google Maps">
            <UInput
              v-model="form.mapsUrl"
              class="w-full"
              placeholder="e.g. https://maps.app.goo.gl/xxxxx หรือ https://www.google.com/maps/..."
              :disabled="saving"
            />
            <template #hint>
              ใส่ URL เต็มจาก Google Maps เท่านั้น (ไม่บังคับ)
            </template>
          </UFormField>

          <UDivider />

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

      <!-- ── KYC Verification card (Super Admin only) ──────────────────── -->
      <UCard v-if="isSuperAdmin">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="bx:shield-check" class="text-lg text-primary" />
            <p class="font-semibold">KYC Verification · การตรวจสอบตัวตน</p>
            <UBadge
              :color="
                verificationStatus === 'active'
                  ? 'success'
                  : verificationStatus === 'expired'
                    ? 'warning'
                    : 'neutral'
              "
              variant="soft"
              class="ml-auto"
            >
              {{
                verificationStatus === "active"
                  ? "Active"
                  : verificationStatus === "expired"
                    ? "Expired"
                    : "Unverified"
              }}
            </UBadge>
          </div>
        </template>

        <div class="space-y-6">
          <!-- ── Status section ─────────────────────────────────────────── -->
          <div class="space-y-2">
            <p class="text-sm font-medium">Verification Status</p>
            <div class="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <p class="text-xs text-muted">Status</p>
                <p
                  :class="
                    verificationStatus === 'active'
                      ? 'font-semibold text-success-600 dark:text-success-400'
                      : verificationStatus === 'expired'
                        ? 'font-semibold text-warning-600 dark:text-warning-400'
                        : 'text-muted'
                  "
                >
                  {{
                    verificationStatus === "active"
                      ? "✓ Verified (Active)"
                      : verificationStatus === "expired"
                        ? "⚠ Expired"
                        : "Not verified"
                  }}
                </p>
              </div>
              <div v-if="partner?.verifiedUntil">
                <p class="text-xs text-muted">Verified Until</p>
                <p>{{ formatDate(partner.verifiedUntil) }}</p>
              </div>
              <div v-if="partner?.verifiedByUserId">
                <p class="text-xs text-muted">Verified By (User ID)</p>
                <p class="break-all font-mono text-xs">
                  {{ partner.verifiedByUserId }}
                </p>
              </div>
              <div v-if="partner?.verificationCancelledAt">
                <p class="text-xs text-muted">Cancelled At</p>
                <p>{{ formatDate(partner.verificationCancelledAt) }}</p>
              </div>
            </div>
          </div>

          <UDivider />

          <!-- ── Upload section ─────────────────────────────────────────── -->
          <div class="space-y-3">
            <p class="text-sm font-medium">Upload KYC Documents</p>
            <p class="text-xs text-muted">
              เอกสารจะถูกจัดเก็บอย่างปลอดภัย (Private) — ไม่มี URL สาธารณะ ·
              การอัปโหลดไม่เปลี่ยนสถานะการยืนยัน
            </p>

            <!-- Dropzone -->
            <div
              class="cursor-pointer select-none rounded-lg border-2 border-dashed p-6 text-center transition-colors"
              :class="
                kycDropActive
                  ? 'border-primary bg-primary/5 dark:bg-primary/10'
                  : 'border-neutral-300 bg-neutral-50 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600'
              "
              role="button"
              tabindex="0"
              aria-label="เลือกหรือวางไฟล์ KYC"
              @click="!uploadingKyc && kycFileInput?.click()"
              @keydown.enter="!uploadingKyc && kycFileInput?.click()"
              @dragover.prevent
              @dragenter.prevent="kycDropActive = true"
              @dragleave="kycDropActive = false"
              @drop.prevent="handleKycDrop($event as DragEvent)"
            >
              <UIcon
                name="bx:cloud-upload"
                class="mx-auto text-4xl text-muted"
              />
              <p class="mt-2 text-sm font-medium text-muted">
                วางไฟล์ที่นี่ หรือคลิกเพื่อเลือก
              </p>
              <p class="mt-1 text-xs text-muted">
                PDF, JPEG, PNG, WebP · ไม่เกิน 20 MB ต่อไฟล์
              </p>
            </div>

            <!-- Hidden file input -->
            <input
              ref="kycFileInput"
              type="file"
              :accept="KYC_ACCEPT"
              multiple
              class="hidden"
              @change="handleKycFileChange"
            />

            <!-- Staged files -->
            <div v-if="stagedKycFiles.length" class="space-y-2">
              <p class="text-xs font-medium text-muted">
                ไฟล์ที่รออัปโหลด ({{ stagedKycFiles.length }})
              </p>
              <div
                v-for="(file, idx) in stagedKycFiles"
                :key="idx"
                class="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div class="flex min-w-0 items-center gap-2">
                  <UIcon name="bx:file" class="shrink-0 text-muted" />
                  <span class="truncate">{{ file.name }}</span>
                  <span class="shrink-0 text-xs text-muted">
                    ({{ formatFileSize(file.size) }})
                  </span>
                </div>
                <UButton
                  size="xs"
                  icon="bx:x"
                  variant="ghost"
                  color="error"
                  :disabled="uploadingKyc"
                  @click="removeKycStagedFile(idx)"
                />
              </div>
            </div>

            <!-- Upload button -->
            <div class="flex justify-end">
              <UButton
                color="primary"
                icon="bx:upload"
                :loading="uploadingKyc"
                :disabled="!stagedKycFiles.length || uploadingKyc"
                @click="void uploadKycDocuments()"
              >
                Upload Documents ({{ stagedKycFiles.length }})
              </UButton>
            </div>
          </div>

          <UDivider />

          <!-- ── Uploaded documents list ──────────────────────────────── -->
          <div class="space-y-3">
            <p class="text-sm font-medium">
              Uploaded Documents
              <span class="ml-1 text-xs font-normal text-muted">
                ({{ partner?.kycDocuments?.documents?.length ?? 0 }})
              </span>
            </p>
            <p
              v-if="!partner?.kycDocuments?.documents?.length"
              class="text-sm text-muted"
            >
              ยังไม่มีเอกสาร KYC
            </p>
            <div
              v-for="doc in partner?.kycDocuments?.documents"
              :key="doc.id"
              class="space-y-1 rounded-lg border p-3 text-sm"
            >
              <div class="flex items-start gap-2">
                <UIcon
                  name="bx:file-blank"
                  class="mt-0.5 shrink-0 text-primary"
                />
                <div class="min-w-0 flex-1 space-y-0.5">
                  <p class="truncate font-medium">{{ doc.name }}</p>
                  <p class="text-xs text-muted">
                    {{ doc.mimeType }} · {{ formatFileSize(doc.sizeBytes) }}
                  </p>
                  <p class="text-xs text-muted">
                    Uploaded: {{ formatDate(doc.uploadedAt) }}
                  </p>
                  <p class="break-all font-mono text-xs text-muted">
                    By: {{ doc.uploadedByUserId }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <UDivider />

          <!-- ── Actions ─────────────────────────────────────────────── -->
          <div class="space-y-3">
            <p class="text-sm font-medium">Verification Actions</p>
            <div class="flex flex-wrap gap-3">
              <!-- Verify 1 Year: only when unverified or expired -->
              <UButton
                v-if="verificationStatus !== 'active'"
                color="success"
                icon="bx:shield-check"
                :loading="verifying"
                :disabled="verifying || cancellingVerification"
                @click="void handleVerify()"
              >
                Verify 1 Year
              </UButton>

              <!-- Cancel Verification: only when active -->
              <UButton
                v-if="verificationStatus === 'active'"
                color="error"
                variant="soft"
                icon="bx:shield-x"
                :loading="cancellingVerification"
                :disabled="verifying || cancellingVerification"
                @click="void handleVerifyCancel()"
              >
                Cancel Verification
              </UButton>
            </div>
          </div>
        </div>
      </UCard>

      <!-- ── Taxonomy Categories (migration 116) ──────────────────────── -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="bx:category" class="text-lg text-primary" />
            <p class="font-semibold">{{ t("adminPartners.taxonomy.sectionTitle") }}</p>
          </div>
        </template>

        <div v-if="taxonomyLoading" class="py-2 text-sm text-muted">
          {{ t("adminPartners.taxonomy.loading") }}
        </div>

        <div v-else class="space-y-4">
          <UFormField :label="t('adminPartners.taxonomy.primaryLabel')">
            <USelectMenu
              v-model="taxonomyPrimaryId"
              :items="taxonomyPrimaryOptions"
              value-key="value"
              :placeholder="t('adminPartners.taxonomy.primaryPlaceholder')"
              class="w-full"
              :disabled="taxonomySaving"
            />
            <template #hint>{{ t("adminPartners.taxonomy.primaryHint") }}</template>
          </UFormField>

          <UFormField :label="t('adminPartners.taxonomy.secondaryLabel')">
            <AdminChipInput
              :model-value="taxonomySecondaryIds"
              :options="taxonomySecondaryOptions"
              :disabled="taxonomySaving || !taxonomyPrimaryId"
              :max-visible-options="20"
              :placeholder="
                taxonomyPrimaryId
                  ? t('adminPartners.taxonomy.secondaryPlaceholder')
                  : t('adminPartners.taxonomy.secondaryNeedsPrimary')
              "
              @update:model-value="(v) => (taxonomySecondaryIds = v)"
            />
            <template #hint>{{ t("adminPartners.taxonomy.secondaryHint") }}</template>
          </UFormField>
        </div>

        <template #footer>
          <div class="flex justify-end">
            <UButton
              color="primary"
              icon="bx:save"
              :loading="taxonomySaving"
              :disabled="taxonomySaving || taxonomyLoading"
              @click="void saveTaxonomy()"
            >
              {{ t("adminPartners.taxonomy.saveButton") }}
            </UButton>
          </div>
        </template>
      </UCard>

      <!-- ── Search & Discovery (admin-only internal metadata) ──────── -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="bx:search-alt" class="text-lg text-primary" />
            <p class="font-semibold">Search & Discovery</p>
          </div>
        </template>

        <UFormField label="Search keywords (คำค้นหาภายใน)">
          <AdminChipInput
            :model-value="form.searchKeywords"
            :allow-custom="true"
            :max-items="SEARCH_KEYWORD_MAX_ITEMS"
            :disabled="saving"
            placeholder="พิมพ์คำค้นหาแล้วกด Enter เช่น สว่าน, ไฟฟ้า, PPE"
            @update:model-value="setSearchKeywords"
          />
          <template #hint>
            Internal search keywords. Used for search only and not shown
            publicly. (สูงสุด {{ SEARCH_KEYWORD_MAX_ITEMS }} คำ ยาวคำละไม่เกิน
            {{ SEARCH_KEYWORD_MAX_LEN }} ตัวอักษร)
          </template>
        </UFormField>

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
