<script setup lang="ts">
import type { ChatConversationDto, ChatMessageDto } from "~/types/chat";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

const route = useRoute();
const user = useSupabaseUser();
const toast = useToast();
const chat = useChat();
const draft = ref("");
const listRef = ref<HTMLElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const attachmentPreviewUrls = reactive<Record<string, string>>({});
const ATTACHMENT_NAME_MAX_CHARS = 8;

const conversationId = computed(() => {
  const raw = route.params.id;
  return Array.isArray(raw) ? raw[0] : String(raw ?? "");
});

const conversation = computed<ChatConversationDto | null>(
  () =>
    chat.conversations.value.find((item) => item.id === conversationId.value) ??
    chat.activeConversation.value,
);
const canSend = computed(
  () =>
    draft.value.trim().length > 0 &&
    !chat.sending.value &&
    !chat.uploading.value &&
    Boolean(conversationId.value),
);

function customerLabel(item: ChatConversationDto | null) {
  return (
    item?.customer?.fullName ||
    item?.customer?.phone ||
    `Customer ${item?.customerId?.slice(0, 8) ?? "-"}`
  );
}

function isAdminMessage(message: ChatMessageDto) {
  const customerId = conversation.value?.customerId;
  if (customerId) return message.senderId !== customerId;
  return message.senderId === user.value?.id;
}

function formatDate(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function attachmentDisplayName(attachment: {
  fileName: string | null;
  storagePath: string;
}) {
  return (
    attachment.fileName ||
    attachment.storagePath.split("/").filter(Boolean).at(-1) ||
    "Attachment"
  );
}

function attachmentDisplayNameParts(attachment: {
  fileName: string | null;
  storagePath: string;
}) {
  const displayName = attachmentDisplayName(attachment);
  const dotIndex = displayName.lastIndexOf(".");
  const truncateName = (name: string) =>
    name.length > ATTACHMENT_NAME_MAX_CHARS
      ? `${name.slice(0, ATTACHMENT_NAME_MAX_CHARS)}...`
      : name;

  if (dotIndex <= 0 || dotIndex === displayName.length - 1) {
    return { name: truncateName(displayName), extension: "" };
  }

  const name = displayName.slice(0, dotIndex);
  return {
    name: truncateName(name),
    extension: displayName.slice(dotIndex),
  };
}

async function ensureAttachmentPreviews() {
  const imageAttachments = chat.messages.value.flatMap((message) =>
    message.attachments.filter((attachment) => attachment.kind === "image"),
  );
  await Promise.all(
    imageAttachments.map(async (attachment) => {
      if (attachmentPreviewUrls[attachment.id]) return;
      try {
        attachmentPreviewUrls[attachment.id] =
          await chat.getAttachmentSignedUrl(attachment.id);
      } catch {
        // Keep the thread usable even if preview signing fails.
      }
    }),
  );
}

function scrollToBottom() {
  nextTick(() => {
    if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight;
  });
}

async function loadThread() {
  if (!conversationId.value) return;
  await chat.loadConversations({ limit: 50 });
  const selected = chat.conversations.value.find(
    (item) => item.id === conversationId.value,
  );
  if (selected) chat.activeConversation.value = selected;
  await chat.loadMessages(conversationId.value);
  await chat.markRead(conversationId.value);
  chat.subscribe(conversationId.value);
  await ensureAttachmentPreviews();
  scrollToBottom();
}

async function sendReply() {
  const body = draft.value.trim();
  if (!body) return;
  try {
    draft.value = "";
    await chat.sendMessage(conversationId.value, body);
    await chat.markRead(conversationId.value);
    scrollToBottom();
  } catch (e) {
    draft.value = body;
    toast.add({
      title: "Could not send reply",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
      icon: "bx:error-circle",
    });
  }
}

function triggerFilePicker() {
  fileInputRef.value?.click();
}

async function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !conversationId.value) return;

  const validationError = validateChatUploadFile(file);
  if (validationError) {
    toast.add({
      title: "Could not upload file",
      description: validationError,
      color: "error",
      icon: "bx:error-circle",
    });
    return;
  }

  try {
    await chat.uploadAttachment(conversationId.value, file, draft.value);
    draft.value = "";
    await chat.markRead(conversationId.value);
    await ensureAttachmentPreviews();
    scrollToBottom();
  } catch (e) {
    toast.add({
      title: "Could not upload file",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
      icon: "bx:error-circle",
    });
  }
}

async function openMessageAttachment(attachmentId: string) {
  const attachment = chat.messages.value
    .flatMap((message) => message.attachments)
    .find((item) => item.id === attachmentId);
  if (!attachment) return;

  try {
    await chat.openAttachment(attachment);
  } catch (e) {
    toast.add({
      title: "Could not open attachment",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
      icon: "bx:error-circle",
    });
  }
}

if (import.meta.client) {
  onMounted(loadThread);
  watch(conversationId, () => void loadThread());
}

watch(
  () => chat.messages.value,
  () => {
    void ensureAttachmentPreviews();
    scrollToBottom();
  },
  { deep: true },
);
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <UButton
        to="/admin/messages"
        variant="ghost"
        color="neutral"
        icon="bx:arrow-back"
      >
        Back to inbox
      </UButton>
      <UButton
        variant="soft"
        color="primary"
        icon="bx:refresh"
        :loading="chat.loadingMessages.value"
        @click="loadThread"
      >
        Refresh
      </UButton>
    </div>

    <UCard>
      <template #header>
        <div
          class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
        >
          <div>
            <h2 class="text-xl font-semibold">
              {{ customerLabel(conversation) }}
            </h2>
            <p class="text-sm text-muted">
              {{ conversation?.subjectType ?? "general" }}
              <span v-if="conversation?.subjectId">
                · {{ conversation.subjectId }}</span
              >
            </p>
          </div>
          <UBadge
            :color="conversation?.status === 'open' ? 'success' : 'neutral'"
            variant="soft"
          >
            {{ conversation?.status ?? "open" }}
          </UBadge>
        </div>
      </template>

      <div class="space-y-4">
        <UAlert
          v-if="chat.error.value"
          color="error"
          variant="soft"
          title="Could not load thread"
          :description="chat.error.value"
        />

        <div
          ref="listRef"
          class="max-h-[60vh] min-h-96 space-y-3 overflow-y-auto rounded-2xl bg-neutral-50 p-4"
        >
          <div
            v-if="chat.loadingMessages.value"
            class="sticky top-0 z-10 -mx-4 -mt-4 bg-neutral-50 px-4 pt-4"
          >
            <div class="h-1 overflow-hidden rounded-full bg-primary/15">
              <div
                class="h-full w-full origin-left animate-pulse rounded-full bg-primary"
              />
            </div>
          </div>
          <div
            v-if="
              chat.messages.value.length === 0 && !chat.loadingMessages.value
            "
            class="py-10 text-center text-sm text-muted"
          >
            No messages in this conversation yet.
          </div>
          <div
            v-for="message in chat.messages.value"
            :key="message.id"
            class="flex"
            :class="isAdminMessage(message) ? 'justify-end' : 'justify-start'"
          >
            <div
              class="max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm"
              :class="
                isAdminMessage(message)
                  ? 'bg-primary text-default ring-1 ring-primary/30'
                  : 'border border-default bg-white text-default'
              "
            >
              <p
                v-if="message.body || message.deletedAt"
                class="whitespace-pre-wrap wrap-break-word"
              >
                {{ message.deletedAt ? "Message deleted" : message.body }}
              </p>
              <div v-if="message.attachments.length" class="mt-2 space-y-2">
                <div
                  v-for="attachment in message.attachments"
                  :key="attachment.id"
                >
                  <button
                    v-if="attachment.kind === 'image'"
                    type="button"
                    class="group block size-32 overflow-hidden rounded-xl bg-white/70 ring-1 ring-black/10 transition hover:opacity-90"
                    :title="attachmentDisplayName(attachment)"
                    @click="openMessageAttachment(attachment.id)"
                  >
                    <img
                      v-if="attachmentPreviewUrls[attachment.id]"
                      :src="attachmentPreviewUrls[attachment.id]"
                      :alt="attachmentDisplayName(attachment)"
                      class="size-full object-cover"
                      loading="lazy"
                    />
                    <span
                      v-else
                      class="flex size-full items-center justify-center text-muted"
                    >
                      <UIcon name="bx:image" class="size-6" />
                    </span>
                  </button>
                  <div
                    v-else
                    class="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 text-xs text-default ring-1 ring-black/5"
                  >
                    <UIcon name="bx:file" class="size-4 shrink-0 text-muted" />
                    <span class="flex min-w-0 flex-1 items-baseline">
                      <span class="min-w-0 truncate">
                        {{ attachmentDisplayNameParts(attachment).name }}
                      </span>
                      <span class="shrink-0">
                        {{ attachmentDisplayNameParts(attachment).extension }}
                      </span>
                    </span>
                    <button
                      type="button"
                      class="shrink-0 rounded-full bg-primary px-2 py-1 text-[10px] font-semibold text-default transition hover:opacity-90"
                      @click="openMessageAttachment(attachment.id)"
                    >
                      Download
                    </button>
                  </div>
                </div>
              </div>
              <p class="mt-2 text-[11px] opacity-70">
                {{ formatDate(message.createdAt) }}
              </p>
            </div>
          </div>
        </div>

        <div class="space-y-2">
          <div class="flex items-end gap-3">
            <input
              ref="fileInputRef"
              type="file"
              class="hidden"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              @change="handleFileSelected"
            />
            <UButton
              color="neutral"
              variant="outline"
              icon="bx:plus"
              :loading="chat.uploading.value"
              :disabled="chat.uploading.value || !conversationId"
              @click="triggerFilePicker"
            />
            <textarea
              v-model="draft"
              rows="3"
              maxlength="4000"
              class="min-w-0 flex-1 resize-none rounded-2xl border border-default bg-white px-4 py-3 text-sm text-default outline-none transition focus:border-primary"
              placeholder="Type an admin reply..."
              @keydown.enter.exact.prevent="sendReply"
            />
            <UButton
              color="primary"
              icon="bx:send"
              :loading="chat.sending.value"
              :disabled="!canSend"
              @click="sendReply"
            >
              Send
            </UButton>
          </div>
          <p class="text-xs text-muted">
            Allowed uploads: JPG, PNG, WebP images up to 5 MB; PDF up to 10 MB.
            Text in the box will be sent as the attachment caption.
          </p>
        </div>
      </div>
    </UCard>
  </div>
</template>
