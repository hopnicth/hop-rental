<script setup lang="ts">
type ExistingImageCard = {
  id: string;
  imageUrl: string;
  title: string;
  caption?: string;
  status?: "ready" | "processing" | "failed";
  error?: string;
};

type QueuedImageItem = {
  id: string;
  file: File;
  objectUrl: string;
  name: string;
  sizeLabel: string;
};

const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    uploadEndpoint: string;
    existingItems?: ExistingImageCard[];
    emptyMessage?: string;
    disabled?: boolean;
    fit?: "contain" | "cover";
    allowExistingActions?: boolean;
    existingActionsDisabled?: boolean;
  }>(),
  {
    description: "",
    existingItems: () => [],
    emptyMessage: "No images yet",
    disabled: false,
    fit: "contain",
    allowExistingActions: true,
    existingActionsDisabled: false,
  },
);

const emit = defineEmits<{
  uploaded: [result: { uploaded: number; failed: number }];
  "set-cover-existing": [imageId: string];
  "remove-existing": [imageId: string];
}>();

const toast = useToast();
const selectedFiles = ref<File[] | null>([]);
const queuedItems = ref<QueuedImageItem[]>([]);
const uploading = ref(false);

function normalizeFileList(value: File[] | File | null | undefined) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function formatFileSize(value: number) {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function syncQueuedItems(files: File[]) {
  const previous = new Map(
    queuedItems.value.map((item) => [
      `${item.file.name}:${item.file.size}:${item.file.lastModified}`,
      item.objectUrl,
    ]),
  );

  const next = files.map((file, index) => {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    const objectUrl = previous.get(key) ?? URL.createObjectURL(file);
    previous.delete(key);

    return {
      id: `${key}:${index}`,
      file,
      objectUrl,
      name: file.name,
      sizeLabel: formatFileSize(file.size),
    } satisfies QueuedImageItem;
  });

  for (const url of previous.values()) {
    URL.revokeObjectURL(url);
  }

  queuedItems.value = next;
}

watch(selectedFiles, (value) => {
  syncQueuedItems(normalizeFileList(value));
});

onBeforeUnmount(() => {
  for (const item of queuedItems.value) {
    URL.revokeObjectURL(item.objectUrl);
  }
});

function setCoverImage(imageId: string) {
  const item = queuedItems.value.find((entry) => entry.id === imageId);
  if (!item) return;
  queuedItems.value = [
    item,
    ...queuedItems.value.filter((entry) => entry.id !== imageId),
  ];
  selectedFiles.value = queuedItems.value.map((entry) => entry.file);
}

function removeQueuedImage(imageId: string) {
  const removed = queuedItems.value.find((entry) => entry.id === imageId);
  if (removed) URL.revokeObjectURL(removed.objectUrl);
  queuedItems.value = queuedItems.value.filter((entry) => entry.id !== imageId);
  selectedFiles.value = queuedItems.value.map((entry) => entry.file);
}

function setCoverExisting(imageId: string) {
  if (props.disabled || props.existingActionsDisabled) return;
  emit("set-cover-existing", imageId);
}

function removeExisting(imageId: string) {
  if (props.disabled || props.existingActionsDisabled) return;
  emit("remove-existing", imageId);
}

async function uploadQueuedImages() {
  if (props.disabled || uploading.value || queuedItems.value.length === 0)
    return;

  uploading.value = true;
  let uploaded = 0;
  let failed = 0;

  try {
    for (const [index, item] of queuedItems.value.entries()) {
      const formData = new FormData();
      formData.append("file", item.file);
      formData.append("fit", props.fit);
      formData.append(
        "title",
        index === 0 ? "Cover image" : `Gallery image ${index + 1}`,
      );
      if (index === 0) {
        formData.append("setAsCover", "true");
      }

      try {
        await $fetch(props.uploadEndpoint, { method: "POST", body: formData });
        uploaded += 1;
      } catch (error) {
        failed += 1;
        console.warn("[AdminMediaGalleryManager] image upload failed", error);
      }
    }

    if (uploaded > 0) {
      toast.add({
        title: "Images queued",
        description: `Queued ${uploaded} image(s) for background processing.`,
        color: "success",
        icon: "bx:check-circle",
      });
    }

    if (failed > 0) {
      toast.add({
        title: "Some images could not be queued",
        description: `${failed} file(s) failed to upload.`,
        color: "warning",
        icon: "bx:error-circle",
      });
    }

    selectedFiles.value = [];
    emit("uploaded", { uploaded, failed });
  } finally {
    uploading.value = false;
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <div>
        <h3 class="text-lg font-semibold">{{ title }}</h3>
        <p v-if="description" class="text-sm text-muted">{{ description }}</p>
      </div>
    </template>

    <div class="space-y-4">
      <div
        v-if="existingItems.length > 0"
        class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        <UCard
          v-for="(item, index) in existingItems"
          :key="item.id"
          variant="subtle"
        >
          <div class="space-y-3">
            <div
              class="flex aspect-square items-center justify-center rounded-lg border border-default bg-muted"
            >
              <img
                v-if="item.imageUrl"
                :src="item.imageUrl"
                :alt="item.title"
                class="h-full w-full rounded-lg object-cover"
              />
              <span v-else class="px-3 text-center text-xs text-muted">{{
                item.status === "processing"
                  ? "Processing"
                  : item.status === "failed"
                    ? "Failed"
                    : "No preview"
              }}</span>
            </div>
            <div class="space-y-1">
              <div class="flex items-center justify-between gap-2">
                <p class="truncate text-sm font-medium">
                  {{ item.title || `Image ${index + 1}` }}
                </p>
                <UBadge
                  :color="
                    item.status === 'failed'
                      ? 'error'
                      : item.status === 'processing'
                        ? 'warning'
                        : 'primary'
                  "
                  variant="soft"
                >
                  {{ item.status || (index === 0 ? "cover" : `#${index + 1}`) }}
                </UBadge>
              </div>
              <p v-if="item.caption" class="text-xs text-muted">
                {{ item.caption }}
              </p>
              <p v-if="item.error" class="text-xs text-error">
                {{ item.error }}
              </p>
            </div>

            <div v-if="allowExistingActions" class="flex flex-wrap gap-2">
              <UButton
                type="button"
                size="xs"
                variant="soft"
                color="primary"
                :disabled="index === 0 || disabled || existingActionsDisabled"
                @click="setCoverExisting(item.id)"
              >
                Set as cover
              </UButton>
              <UButton
                type="button"
                size="xs"
                variant="soft"
                color="error"
                :disabled="disabled || existingActionsDisabled"
                @click="removeExisting(item.id)"
              >
                Delete
              </UButton>
            </div>
          </div>
        </UCard>
      </div>

      <div
        v-else
        class="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-default bg-muted text-sm text-muted"
      >
        {{ emptyMessage }}
      </div>

      <UFileUpload
        v-model="selectedFiles"
        multiple
        accept="image/jpeg,image/png,image/webp"
        layout="grid"
        label="Drop images here"
        description="JPEG, PNG, or WebP up to 15MB each. The first image becomes the cover."
        icon="i-lucide-image"
        class="min-h-52 w-full"
        :disabled="disabled || uploading"
      />

      <div v-if="queuedItems.length > 0" class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-medium">Queued uploads</p>
          <p class="text-xs text-muted">
            {{ queuedItems.length }} image(s) ready
          </p>
        </div>

        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <UCard
            v-for="(item, index) in queuedItems"
            :key="item.id"
            variant="subtle"
          >
            <div class="space-y-3">
              <img
                :src="item.objectUrl"
                :alt="item.name"
                class="aspect-square w-full rounded-lg border border-default object-cover"
              />
              <div class="space-y-1">
                <div class="flex items-center justify-between gap-2">
                  <p class="truncate text-sm font-medium">{{ item.name }}</p>
                  <UBadge
                    :color="index === 0 ? 'primary' : 'neutral'"
                    variant="soft"
                    >{{ index === 0 ? "Cover" : `#${index + 1}` }}</UBadge
                  >
                </div>
                <p class="text-xs text-muted">{{ item.sizeLabel }}</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <UButton
                  type="button"
                  size="xs"
                  variant="soft"
                  color="primary"
                  :disabled="index === 0"
                  @click="setCoverImage(item.id)"
                  >Set as cover</UButton
                >
                <UButton
                  type="button"
                  size="xs"
                  variant="soft"
                  color="error"
                  @click="removeQueuedImage(item.id)"
                  >Remove</UButton
                >
              </div>
            </div>
          </UCard>
        </div>

        <div class="flex justify-end">
          <UButton
            type="button"
            color="primary"
            :loading="uploading"
            @click="uploadQueuedImages"
            >Upload queued images</UButton
          >
        </div>
      </div>
    </div>
  </UCard>
</template>
