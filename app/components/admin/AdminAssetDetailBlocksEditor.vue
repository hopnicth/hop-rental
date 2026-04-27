<script setup lang="ts">
import type {
  AssetDetailBlock,
  AssetDetailBlockDocument,
  AssetDetailBlockImage,
} from "~/types/asset";
import type { LocaleCode } from "~/types/locale";

type DocumentKind = AssetDetailBlockDocument["kind"];

const props = defineProps<{
  modelValue: AssetDetailBlock[];
  disabled?: boolean;
  uploading?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: AssetDetailBlock[]): void;
  (e: "upload-image", payload: { blockKey: string; file: File }): void;
  (
    e: "upload-document",
    payload: {
      blockKey: string;
      file: File;
      kind: DocumentKind;
      title: string;
    },
  ): void;
  (e: "remove-image", payload: { blockKey: string; imageId: string }): void;
  (
    e: "remove-document",
    payload: { blockKey: string; documentId: string },
  ): void;
}>();

const LOCALES: LocaleCode[] = ["th", "en", "cn", "jp"];
const LOCALE_LABEL: Record<LocaleCode, string> = {
  th: "TH",
  en: "EN",
  cn: "CN",
  jp: "JP",
};

const DOCUMENT_KIND_OPTIONS: Array<{ value: DocumentKind; label: string }> = [
  { value: "manual", label: "Manual" },
  { value: "catalog", label: "Catalog" },
  { value: "datasheet", label: "Datasheet" },
  { value: "guide", label: "Guide" },
  { value: "report", label: "Report" },
  { value: "other", label: "Other" },
];

function emptyLocalized() {
  return { th: "", en: "", cn: "", jp: "" } as Record<LocaleCode, string>;
}

function ensureLocalized(value?: Record<string, string>) {
  const base = emptyLocalized();
  if (value) for (const key of LOCALES) base[key] = value[key] ?? "";
  return base;
}

function cloneBlock(block: AssetDetailBlock): AssetDetailBlock {
  return {
    key: block.key,
    title: block.title ? { ...block.title } : undefined,
    body: block.body ? { ...block.body } : undefined,
    items: block.items ? [...block.items] : undefined,
    images: block.images ? block.images.map((i) => ({ ...i })) : undefined,
    documents: block.documents
      ? block.documents.map((d) => ({ ...d }))
      : undefined,
  };
}

function commit(blocks: AssetDetailBlock[]) {
  emit("update:modelValue", blocks);
}

function generateBlockKey(existing: AssetDetailBlock[]) {
  let i = existing.length + 1;
  while (existing.some((entry) => entry.key === `block-${i}`)) i++;
  return `block-${i}`;
}

function addBlock() {
  if (props.disabled) return;
  const next = props.modelValue.map(cloneBlock);
  next.push({
    key: generateBlockKey(next),
    title: emptyLocalized(),
    body: emptyLocalized(),
  });
  commit(next);
}

function removeBlock(index: number) {
  if (props.disabled) return;
  const block = props.modelValue[index];
  if (block && (block.images?.length || block.documents?.length)) {
    if (
      !confirm(
        "This block still has uploaded media. Remove the block and orphan those files?",
      )
    ) {
      return;
    }
  } else if (!confirm("Remove this block?")) {
    return;
  }
  const next = props.modelValue.map(cloneBlock);
  next.splice(index, 1);
  commit(next);
}

function moveBlock(index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= props.modelValue.length) return;
  const next = props.modelValue.map(cloneBlock);
  const [removed] = next.splice(index, 1);
  next.splice(target, 0, removed);
  commit(next);
}

function updateBlockKey(index: number, value: string) {
  const trimmed = value.trim().replace(/\s+/g, "-").toLowerCase();
  const next = props.modelValue.map(cloneBlock);
  next[index] = { ...next[index], key: trimmed || `block-${index + 1}` };
  commit(next);
}

function updateLocalizedField(
  index: number,
  field: "title" | "body",
  locale: LocaleCode,
  value: string,
) {
  const next = props.modelValue.map(cloneBlock);
  const localized = ensureLocalized(
    next[index][field] as Record<string, string>,
  );
  localized[locale] = value;
  next[index] = { ...next[index], [field]: localized };
  commit(next);
}

function updateItemsText(index: number, value: string) {
  const items = value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const next = props.modelValue.map(cloneBlock);
  next[index] = { ...next[index], items };
  commit(next);
}

function itemsAsText(items?: string[]) {
  return (items ?? []).join("\n");
}

function pickImage(blockKey: string, event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) emit("upload-image", { blockKey, file });
  input.value = "";
}

function pickDocument(
  blockKey: string,
  event: Event,
  kind: DocumentKind,
  title: string,
) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) emit("upload-document", { blockKey, file, kind, title });
  input.value = "";
}

function imageThumb(image: AssetDetailBlockImage) {
  return image.variants?.thumbnail || image.variants?.card || image.url;
}

function formatSize(bytes?: number) {
  if (!bytes || !Number.isFinite(bytes)) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

const docDrafts = reactive<
  Record<string, { title: string; kind: DocumentKind }>
>({});

function ensureDocDraft(blockKey: string) {
  if (!docDrafts[blockKey]) {
    docDrafts[blockKey] = { title: "", kind: "manual" };
  }
  return docDrafts[blockKey];
}

function titleField(block: AssetDetailBlock, locale: LocaleCode) {
  return block.title?.[locale] ?? "";
}

function bodyField(block: AssetDetailBlock, locale: LocaleCode) {
  return block.body?.[locale] ?? "";
}
</script>

<template>
  <div class="space-y-4">
    <div
      v-if="!modelValue?.length"
      class="rounded border border-dashed border-default p-4 text-sm text-muted"
    >
      No detail blocks yet. Add one below to start writing content.
    </div>

    <div
      v-for="(block, index) in modelValue"
      :key="`${block.key}-${index}`"
      class="rounded-lg border border-default p-4 space-y-3"
    >
      <div class="flex flex-wrap items-start justify-between gap-2">
        <UFormField label="Block key" class="flex-1 min-w-50">
          <UInput
            :model-value="block.key"
            placeholder="block-1"
            :disabled="disabled"
            @update:model-value="(v) => updateBlockKey(index, String(v ?? ''))"
          />
        </UFormField>
        <div class="flex items-center gap-1 pt-6">
          <UButton
            size="xs"
            variant="soft"
            color="neutral"
            icon="bx:up-arrow-alt"
            :disabled="disabled || index === 0"
            @click="moveBlock(index, -1)"
          />
          <UButton
            size="xs"
            variant="soft"
            color="neutral"
            icon="bx:down-arrow-alt"
            :disabled="disabled || index === modelValue.length - 1"
            @click="moveBlock(index, 1)"
          />
          <UButton
            size="xs"
            variant="soft"
            color="error"
            icon="bx:trash"
            :disabled="disabled"
            @click="removeBlock(index)"
          />
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField
          v-for="locale in LOCALES"
          :key="`title-${locale}`"
          :label="`Title (${LOCALE_LABEL[locale]})`"
        >
          <UInput
            :model-value="titleField(block, locale)"
            :disabled="disabled"
            @update:model-value="
              (v) =>
                updateLocalizedField(index, 'title', locale, String(v ?? ''))
            "
          />
        </UFormField>
      </div>

      <UFormField
        v-for="locale in LOCALES"
        :key="`body-${locale}`"
        :label="`Body (${LOCALE_LABEL[locale]})`"
      >
        <UTextarea
          :model-value="bodyField(block, locale)"
          :rows="3"
          :disabled="disabled"
          placeholder="Write paragraphs separated by blank lines"
          @update:model-value="
            (v) => updateLocalizedField(index, 'body', locale, String(v ?? ''))
          "
        />
      </UFormField>

      <UFormField label="Bullet points (one per line)">
        <UTextarea
          :model-value="itemsAsText(block.items)"
          :rows="3"
          :disabled="disabled"
          placeholder="One bullet per line"
          @update:model-value="(v) => updateItemsText(index, String(v ?? ''))"
        />
      </UFormField>

      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium">Images</p>
          <label
            class="inline-flex items-center gap-2 text-xs"
            :class="{ 'cursor-pointer': !disabled, 'opacity-50': disabled }"
          >
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              class="hidden"
              :disabled="disabled || uploading"
              @change="(ev) => pickImage(block.key, ev)"
            />
            <UButton
              as="span"
              size="xs"
              variant="soft"
              color="primary"
              icon="bx:upload"
              :disabled="disabled || uploading"
            >
              Upload image
            </UButton>
          </label>
        </div>
        <div
          v-if="!block.images?.length"
          class="rounded border border-dashed border-default p-3 text-xs text-muted"
        >
          No images uploaded yet.
        </div>
        <div v-else class="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div
            v-for="image in block.images"
            :key="image.id"
            class="relative overflow-hidden rounded border border-default"
          >
            <img
              :src="imageThumb(image)"
              class="aspect-video w-full object-cover"
              :alt="image.altText || image.caption || ''"
            />
            <UButton
              class="absolute right-1 top-1"
              size="xs"
              color="error"
              variant="solid"
              icon="bx:trash"
              :disabled="disabled"
              @click="
                emit('remove-image', { blockKey: block.key, imageId: image.id })
              "
            />
            <p
              v-if="image.caption"
              class="px-2 py-1 text-xs text-muted truncate"
            >
              {{ image.caption }}
            </p>
          </div>
        </div>
      </div>

      <div class="space-y-2">
        <p class="text-sm font-medium">Documents</p>
        <div
          v-if="!block.documents?.length"
          class="rounded border border-dashed border-default p-3 text-xs text-muted"
        >
          No documents attached yet.
        </div>
        <div v-else class="space-y-1">
          <div
            v-for="doc in block.documents"
            :key="doc.id"
            class="flex items-center justify-between gap-2 rounded border border-default px-2 py-1 text-sm"
          >
            <div class="min-w-0 flex-1">
              <a
                :href="doc.url"
                target="_blank"
                rel="noopener noreferrer"
                class="block truncate text-primary"
              >
                {{ doc.title }}
              </a>
              <p class="truncate text-xs text-muted">
                {{ doc.kind }}
                <span v-if="doc.sizeBytes">
                  · {{ formatSize(doc.sizeBytes) }}</span
                >
              </p>
            </div>
            <UButton
              size="xs"
              color="error"
              variant="soft"
              icon="bx:trash"
              :disabled="disabled"
              @click="
                emit('remove-document', {
                  blockKey: block.key,
                  documentId: doc.id,
                })
              "
            />
          </div>
        </div>

        <div class="grid gap-2 sm:grid-cols-[1fr_140px_140px]">
          <UInput
            v-model="ensureDocDraft(block.key).title"
            placeholder="Document title (optional)"
            :disabled="disabled || uploading"
          />
          <USelectMenu
            v-model="ensureDocDraft(block.key).kind"
            :items="DOCUMENT_KIND_OPTIONS"
            value-key="value"
            :disabled="disabled || uploading"
          />
          <label
            class="inline-flex"
            :class="{ 'cursor-pointer': !disabled, 'opacity-50': disabled }"
          >
            <input
              type="file"
              accept="application/pdf"
              class="hidden"
              :disabled="disabled || uploading"
              @change="
                (ev) =>
                  pickDocument(
                    block.key,
                    ev,
                    ensureDocDraft(block.key).kind,
                    ensureDocDraft(block.key).title,
                  )
              "
            />
            <UButton
              as="span"
              size="sm"
              variant="soft"
              color="primary"
              icon="bx:upload"
              block
              :disabled="disabled || uploading"
            >
              Upload PDF
            </UButton>
          </label>
        </div>
      </div>
    </div>

    <div>
      <UButton
        size="sm"
        variant="soft"
        color="primary"
        icon="bx:plus"
        :disabled="disabled"
        @click="addBlock"
      >
        Add block
      </UButton>
    </div>
  </div>
</template>
