<script setup lang="ts">
import type {
  AdminBookingDocument,
  AdminBookingOpsPayload,
  AssetDocumentVisibility,
  RentalBookingDocumentType,
} from "~/types/admin-booking-ops";

interface Props {
  bookingId: string;
  documents: AdminBookingDocument[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "updated", payload: AdminBookingOpsPayload): void;
}>();

const toast = useToast();
const busy = ref(false);

const TYPE_OPTIONS: { value: RentalBookingDocumentType; label: string }[] = [
  { value: "handover", label: "Handover" },
  { value: "damage_evidence", label: "Damage evidence" },
  { value: "repair", label: "Repair" },
  { value: "fine", label: "Fine" },
  { value: "other", label: "Other" },
];

const VISIBILITY_OPTIONS: { value: AssetDocumentVisibility; label: string }[] =
  [
    { value: "internal", label: "Internal (admin-only)" },
    { value: "customer_after_booking", label: "Customer (after booking)" },
    { value: "public", label: "Public" },
  ];

const TYPE_COLOR: Record<RentalBookingDocumentType, string> = {
  handover: "info",
  damage_evidence: "warning",
  repair: "primary",
  fine: "error",
  other: "neutral",
};

const showUpload = ref(false);
const upload = reactive({
  file: null as File | null,
  documentType: "handover" as RentalBookingDocumentType,
  visibility: "internal" as AssetDocumentVisibility,
  title: "",
  description: "",
  amount: "",
  issuedAt: "",
});

function resetUpload() {
  upload.file = null;
  upload.title = "";
  upload.description = "";
  upload.amount = "";
  upload.issuedAt = "";
}

function onFileChange(e: Event) {
  const t = e.target as HTMLInputElement;
  upload.file = t.files?.[0] ?? null;
  if (upload.file && !upload.title) {
    upload.title = upload.file.name.replace(/\.[^.]+$/, "");
  }
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

async function submitUpload() {
  if (!upload.file) return;
  busy.value = true;
  try {
    const fd = new FormData();
    fd.append("file", upload.file);
    fd.append("documentType", upload.documentType);
    fd.append("visibility", upload.visibility);
    fd.append("title", upload.title);
    if (upload.description) fd.append("description", upload.description);
    if (upload.amount) fd.append("amount", upload.amount);
    if (upload.issuedAt) fd.append("issuedAt", upload.issuedAt);

    const res = await $fetch<AdminBookingOpsPayload>(
      `/api/admin/rental-bookings/${props.bookingId}/documents`,
      { method: "POST", body: fd },
    );
    emit("updated", res);
    toast.add({ title: "Document uploaded", color: "success" });
    showUpload.value = false;
    resetUpload();
  } catch (e) {
    toast.add({
      title: "Upload failed",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    busy.value = false;
  }
}

async function deleteDoc(d: AdminBookingDocument) {
  if (!confirm(`Delete document "${d.title}"?`)) return;
  busy.value = true;
  try {
    const res = await $fetch<AdminBookingOpsPayload>(
      `/api/admin/rental-bookings/${props.bookingId}/documents/${d.id}`,
      { method: "DELETE" },
    );
    emit("updated", res);
    toast.add({ title: "Document removed", color: "success" });
  } catch (e) {
    toast.add({
      title: "Delete failed",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="font-semibold">Documents ({{ documents.length }})</h3>
        <UButton
          size="xs"
          icon="bx:upload"
          label="Upload"
          color="primary"
          variant="soft"
          :loading="busy"
          @click="showUpload = true"
        />
      </div>
    </template>

    <p
      v-if="documents.length === 0"
      class="py-4 text-center text-sm italic text-muted"
    >
      No documents on file.
    </p>

    <ul v-else class="space-y-2">
      <li
        v-for="d in documents"
        :key="d.id"
        class="flex flex-wrap items-start gap-3 rounded-lg border border-default p-3"
      >
        <UIcon
          :name="
            d.mimeType?.startsWith('image/') ? 'bx:image' : 'bx:file-blank'
          "
          class="mt-1 text-2xl text-muted"
        />
        <div class="min-w-0 flex-1 space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <a
              :href="d.fileUrl"
              target="_blank"
              class="font-medium text-primary hover:underline"
            >
              {{ d.title }}
            </a>
            <UBadge
              :color="TYPE_COLOR[d.documentType] as any"
              variant="subtle"
              size="xs"
            >
              {{ d.documentType.replace("_", " ") }}
            </UBadge>
            <UBadge color="neutral" variant="soft" size="xs">
              {{ d.visibility.replace("_", " ") }}
            </UBadge>
          </div>
          <p v-if="d.description" class="text-xs text-muted">
            {{ d.description }}
          </p>
          <p class="text-xs text-muted">
            <span v-if="d.fileName" class="font-mono">{{ d.fileName }}</span>
            · {{ formatBytes(d.fileSizeBytes) }} ·
            {{ formatDate(d.createdAt) }}
            <span v-if="d.amount != null">
              · Amount: {{ d.amount.toFixed(2) }} {{ d.currencyCode }}
            </span>
          </p>
        </div>
        <UButton
          size="xs"
          variant="ghost"
          color="error"
          icon="bx:trash"
          :loading="busy"
          @click="deleteDoc(d)"
        />
      </li>
    </ul>

    <UModal v-model:open="showUpload" title="Upload booking document">
      <template #body>
        <div class="space-y-3">
          <UFormField label="File" hint="PDF or JPEG/PNG/WebP, up to 30MB">
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              class="block w-full text-sm"
              @change="onFileChange"
            />
          </UFormField>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Type">
              <USelect v-model="upload.documentType" :items="TYPE_OPTIONS" />
            </UFormField>
            <UFormField label="Visibility">
              <USelect
                v-model="upload.visibility"
                :items="VISIBILITY_OPTIONS"
              />
            </UFormField>
          </div>
          <UFormField label="Title">
            <UInput v-model="upload.title" placeholder="Document title" />
          </UFormField>
          <UFormField label="Description (optional)">
            <UTextarea v-model="upload.description" :rows="2" />
          </UFormField>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField
              label="Amount (optional)"
              hint="For repair/fine documents"
            >
              <UInput
                v-model="upload.amount"
                type="number"
                step="0.01"
                min="0"
              />
            </UFormField>
            <UFormField label="Issued at (optional)">
              <UInput v-model="upload.issuedAt" type="date" />
            </UFormField>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            :disabled="busy"
            @click="showUpload = false"
          />
          <UButton
            label="Upload"
            color="primary"
            :loading="busy"
            :disabled="!upload.file || !upload.title.trim()"
            @click="void submitUpload()"
          />
        </div>
      </template>
    </UModal>
  </UCard>
</template>
