<script setup lang="ts">
import type {
  AdminBookingChecklist,
  AdminBookingChecklistItem,
  AdminBookingOpsPayload,
  AssetChecklistTemplateSummary,
  RentalChecklistKind,
  RentalChecklistStatus,
  UpdateChecklistItemPayload,
} from "~/types/admin-booking-ops";

interface Props {
  bookingId: string;
  checklists: AdminBookingChecklist[];
  templates: AssetChecklistTemplateSummary[];
  /** When true, all checklists are expanded by default so items are immediately visible. */
  autoExpand?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "updated", payload: AdminBookingOpsPayload): void;
}>();

const toast = useToast();
const expanded = ref<Record<string, boolean>>({});
const busy = ref(false);

// Auto-expand all checklists when autoExpand prop is true (e.g. POS V3 pickup context).
// Runs immediately on mount and whenever the checklists array changes.
watch(
  () => props.checklists,
  (list) => {
    if (props.autoExpand) {
      for (const c of list) {
        expanded.value[c.id] = true;
      }
    }
  },
  { immediate: true },
);

const KIND_LABEL: Record<RentalChecklistKind, string> = {
  pickup: "Pickup",
  return: "Return",
  inspection: "Inspection",
  service: "Service",
};

const STATUS_COLOR: Record<RentalChecklistStatus, string> = {
  draft: "neutral",
  in_progress: "warning",
  completed: "success",
  cancelled: "error",
};

function progress(c: AdminBookingChecklist): { done: number; total: number } {
  const total = c.items.length;
  const done = c.items.filter(
    (it) => it.checked === true || it.resultStatus !== "pending",
  ).length;
  return { done, total };
}

async function call<T = AdminBookingOpsPayload>(
  url: string,
  init: RequestInit = {},
): Promise<T | null> {
  busy.value = true;
  try {
    const res = await $fetch<T>(url, init as Parameters<typeof $fetch>[1]);
    if (res && typeof res === "object" && "checklists" in (res as object)) {
      emit("updated", res as unknown as AdminBookingOpsPayload);
    }
    return res;
  } catch (e) {
    toast.add({
      title: "Action failed",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
    return null;
  } finally {
    busy.value = false;
  }
}

// ── Create ──
const showCreate = ref(false);
const createMode = ref<"template" | "adhoc">("template");
const createTemplateId = ref<string | null>(null);
const createKind = ref<RentalChecklistKind>("pickup");
const createName = ref("");

async function submitCreate() {
  const body: Record<string, unknown> =
    createMode.value === "template" && createTemplateId.value
      ? { templateId: createTemplateId.value }
      : { kind: createKind.value, name: createName.value.trim() };
  const res = await call(
    `/api/admin/rental-bookings/${props.bookingId}/checklists`,
    { method: "POST", body },
  );
  if (res) {
    toast.add({ title: "Checklist created", color: "success" });
    showCreate.value = false;
    createTemplateId.value = null;
    createName.value = "";
  }
}

async function setStatus(
  c: AdminBookingChecklist,
  status: RentalChecklistStatus,
) {
  await call(
    `/api/admin/rental-bookings/${props.bookingId}/checklists/${c.id}`,
    { method: "PATCH", body: { status } },
  );
}

/**
 * POS context (autoExpand=true): one-click "Complete Checklist" that handles
 * draft → in_progress → completed so staff do not have to press Start first.
 */
async function completeChecklist(c: AdminBookingChecklist) {
  const base = `/api/admin/rental-bookings/${props.bookingId}/checklists/${c.id}`;
  if (c.status === "draft") {
    const r = await call(base, {
      method: "PATCH",
      body: { status: "in_progress" },
    });
    if (!r) return; // API error — stop, toast already shown
  }
  await call(base, { method: "PATCH", body: { status: "completed" } });
}

async function deleteChecklist(c: AdminBookingChecklist) {
  if (!confirm(`Delete checklist "${c.templateName ?? c.kind}"?`)) return;
  await call(
    `/api/admin/rental-bookings/${props.bookingId}/checklists/${c.id}`,
    { method: "DELETE" },
  );
}

async function patchItem(
  c: AdminBookingChecklist,
  it: AdminBookingChecklistItem,
  body: UpdateChecklistItemPayload,
) {
  await call(
    `/api/admin/rental-bookings/${props.bookingId}/checklists/${c.id}/items/${it.id}`,
    { method: "PATCH", body },
  );
}

async function uploadPhoto(
  c: AdminBookingChecklist,
  it: AdminBookingChecklistItem,
  file: File,
) {
  const fd = new FormData();
  fd.append("file", file);
  await call(
    `/api/admin/rental-bookings/${props.bookingId}/checklists/${c.id}/items/${it.id}/photo`,
    { method: "POST", body: fd },
  );
}

function onPhotoChange(
  e: Event,
  c: AdminBookingChecklist,
  it: AdminBookingChecklistItem,
) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) void uploadPhoto(c, it, file);
  target.value = "";
}

const templateOptions = computed(() =>
  props.templates.map((t) => ({
    value: t.id,
    label: `[${KIND_LABEL[t.kind]}] ${t.name} · v${t.version} · ${t.itemCount} items`,
  })),
);

const KIND_OPTIONS: { value: RentalChecklistKind; label: string }[] = [
  { value: "pickup", label: "Pickup" },
  { value: "return", label: "Return" },
  { value: "inspection", label: "Inspection" },
  { value: "service", label: "Service" },
];
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="font-semibold">Checklists ({{ checklists.length }})</h3>
        <UButton
          size="xs"
          icon="bx:plus"
          label="Add checklist"
          color="primary"
          variant="soft"
          :loading="busy"
          @click="showCreate = true"
        />
      </div>
    </template>

    <p
      v-if="checklists.length === 0"
      class="py-4 text-center text-sm italic text-muted"
    >
      No checklists yet. Add one from a template or create an ad-hoc list.
    </p>

    <div class="space-y-3">
      <div
        v-for="c in checklists"
        :key="c.id"
        class="rounded-lg border border-default p-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <UBadge :color="STATUS_COLOR[c.status] as any" variant="subtle">
                {{ c.status }}
              </UBadge>
              <UBadge color="neutral" variant="soft">
                {{ KIND_LABEL[c.kind] }}
              </UBadge>
              <span class="font-medium">
                {{ c.templateName || c.kind }}
              </span>
              <span v-if="c.templateVersion" class="text-xs text-muted">
                v{{ c.templateVersion }}
              </span>
            </div>
            <p class="text-xs text-muted">
              {{ progress(c).done }} / {{ progress(c).total }} items checked
            </p>
          </div>
          <div class="flex flex-wrap gap-1">
            <UButton
              v-if="c.status === 'draft'"
              size="xs"
              variant="soft"
              color="warning"
              :loading="busy"
              @click="setStatus(c, 'in_progress')"
            >
              Start
            </UButton>
            <UButton
              v-if="c.status === 'in_progress'"
              size="xs"
              variant="soft"
              color="success"
              :loading="busy"
              @click="setStatus(c, 'completed')"
            >
              Complete
            </UButton>
            <!-- POS context (autoExpand): prominent one-click Complete Checklist action.
                 Works from draft or in_progress — auto-transitions through in_progress if needed. -->
            <UButton
              v-if="
                autoExpand &&
                c.status !== 'completed' &&
                c.status !== 'cancelled'
              "
              size="sm"
              variant="solid"
              color="success"
              icon="bx:check-double"
              :loading="busy"
              @click="completeChecklist(c)"
            >
              Complete Checklist
            </UButton>
            <UButton
              v-if="c.status !== 'cancelled' && c.status !== 'completed'"
              size="xs"
              variant="ghost"
              color="error"
              :loading="busy"
              @click="setStatus(c, 'cancelled')"
            >
              Cancel
            </UButton>
            <UButton
              size="xs"
              variant="ghost"
              :icon="expanded[c.id] ? 'bx:chevron-up' : 'bx:chevron-down'"
              :label="expanded[c.id] ? 'Hide' : 'Open'"
              @click="expanded[c.id] = !expanded[c.id]"
            />
            <UButton
              size="xs"
              variant="ghost"
              color="error"
              icon="bx:trash"
              :loading="busy"
              @click="deleteChecklist(c)"
            />
          </div>
        </div>

        <div v-if="expanded[c.id]" class="mt-3 space-y-2">
          <div
            v-for="it in c.items"
            :key="it.id"
            class="rounded border border-default/60 bg-elevated/40 p-2"
          >
            <div class="flex flex-wrap items-start gap-2">
              <UCheckbox
                :model-value="it.checked === true"
                :disabled="
                  busy || c.status === 'completed' || c.status === 'cancelled'
                "
                @update:model-value="
                  (v: boolean) =>
                    patchItem(c, it, {
                      checked: v,
                      resultStatus: v ? 'passed' : 'pending',
                    })
                "
              />
              <div class="min-w-0 flex-1 space-y-1">
                <p class="text-sm font-medium">
                  {{ it.label }}
                  <span v-if="it.isRequired" class="text-error">*</span>
                </p>
                <p v-if="it.instruction" class="text-xs text-muted">
                  {{ it.instruction }}
                </p>
                <div class="flex flex-wrap items-center gap-1 text-xs">
                  <UButton
                    size="xs"
                    variant="ghost"
                    :color="it.resultStatus === 'failed' ? 'error' : 'neutral'"
                    :disabled="busy"
                    @click="
                      patchItem(c, it, {
                        resultStatus:
                          it.resultStatus === 'failed' ? 'pending' : 'failed',
                        checked: false,
                      })
                    "
                  >
                    Fail
                  </UButton>
                  <UButton
                    size="xs"
                    variant="ghost"
                    :color="
                      it.resultStatus === 'not_applicable' ? 'info' : 'neutral'
                    "
                    :disabled="busy"
                    @click="
                      patchItem(c, it, {
                        resultStatus:
                          it.resultStatus === 'not_applicable'
                            ? 'pending'
                            : 'not_applicable',
                      })
                    "
                  >
                    N/A
                  </UButton>
                </div>
              </div>
            </div>

            <UInput
              v-if="it.responseType === 'text'"
              :model-value="it.responseText ?? ''"
              size="sm"
              class="mt-2"
              placeholder="Response"
              @blur="
                (e: FocusEvent) =>
                  patchItem(c, it, {
                    responseText: (e.target as HTMLInputElement).value,
                  })
              "
            />
            <UInput
              v-else-if="it.responseType === 'number'"
              :model-value="it.responseNumber ?? ''"
              type="number"
              size="sm"
              class="mt-2"
              placeholder="Response"
              @blur="
                (e: FocusEvent) =>
                  patchItem(c, it, {
                    responseNumber: Number(
                      (e.target as HTMLInputElement).value,
                    ),
                  })
              "
            />

            <UTextarea
              :model-value="it.remark ?? ''"
              :rows="1"
              size="sm"
              class="mt-2"
              placeholder="Remark / note"
              @blur="
                (e: FocusEvent) =>
                  patchItem(c, it, {
                    remark: (e.target as HTMLTextAreaElement).value,
                  })
              "
            />

            <div class="mt-2 flex flex-wrap items-center gap-2">
              <a
                v-for="url in it.photoUrls"
                :key="url"
                :href="url"
                target="_blank"
                class="relative"
              >
                <img
                  :src="url"
                  class="h-14 w-14 rounded object-cover"
                  alt="Checklist photo"
                />
                <button
                  type="button"
                  class="absolute -right-1 -top-1 rounded-full bg-error px-1 text-xs text-white"
                  :disabled="busy"
                  @click.prevent="patchItem(c, it, { removePhotoUrl: url })"
                >
                  ×
                </button>
              </a>
              <label
                class="cursor-pointer rounded border border-dashed border-default px-2 py-1 text-xs text-muted hover:bg-elevated"
              >
                + Photo
                <input
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="onPhotoChange($event, c, it)"
                />
              </label>
            </div>
          </div>
          <p v-if="c.items.length === 0" class="text-sm italic text-muted">
            This checklist has no items.
          </p>
        </div>
      </div>
    </div>

    <UModal v-model:open="showCreate" title="Add checklist">
      <template #body>
        <div class="space-y-3">
          <div class="flex gap-2">
            <UButton
              size="xs"
              :variant="createMode === 'template' ? 'solid' : 'soft'"
              @click="createMode = 'template'"
            >
              From template
            </UButton>
            <UButton
              size="xs"
              :variant="createMode === 'adhoc' ? 'solid' : 'soft'"
              @click="createMode = 'adhoc'"
            >
              Ad-hoc
            </UButton>
          </div>

          <div v-if="createMode === 'template'">
            <p
              v-if="templateOptions.length === 0"
              class="text-sm italic text-muted"
            >
              No active templates on this asset. Create templates from the asset
              detail page first, or use ad-hoc mode.
            </p>
            <USelect
              v-else
              v-model="createTemplateId"
              :items="templateOptions"
              placeholder="Pick a template"
            />
          </div>
          <div v-else class="space-y-2">
            <USelect v-model="createKind" :items="KIND_OPTIONS" />
            <UInput v-model="createName" placeholder="Checklist name" />
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
            @click="showCreate = false"
          />
          <UButton
            label="Create"
            color="primary"
            :loading="busy"
            :disabled="
              (createMode === 'template' && !createTemplateId) ||
              (createMode === 'adhoc' && createName.trim().length === 0)
            "
            @click="void submitCreate()"
          />
        </div>
      </template>
    </UModal>
  </UCard>
</template>
