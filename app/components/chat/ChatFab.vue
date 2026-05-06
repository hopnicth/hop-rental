<script setup lang="ts">
const CHAT_MAX_CHARS = 4000;
const DEFAULT_SUPPORT_PHONE = "+66 95-479-2333";
const DEFAULT_SUPPORT_LINE_URL =
  "https://line.me/R/ti/p/@832vmicv?ts=03031436&oat_content=url";

type ContactSettingsDto = {
  supportPhone: string;
  lineUrl: string;
  updatedAt: string | null;
};

const { t, locale } = useI18n();
const config = useRuntimeConfig();
const user = useSupabaseUser();
const cookieConsent = useCookieConsent();
const isFabVisible = computed(
  () =>
    cookieConsent.hasResponded.value && !cookieConsent.isPreferencesOpen.value,
);
const currentUserId = computed(
  () =>
    ((user.value as any)?.id as string | undefined) ??
    ((user.value as any)?.sub as string | undefined) ??
    null,
);
const toast = useToast();
const chat = useChat();

const isOpen = ref(false);
const draftMessage = ref("");
const bootstrapping = ref(false);
const listRef = ref<HTMLElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const attachmentPreviewUrls = reactive<Record<string, string>>({});
const ATTACHMENT_NAME_MAX_CHARS = 8;

const quickActions = computed(() => [
  t("chatWidget.actions.products"),
  t("chatWidget.actions.rental"),
  t("chatWidget.actions.quote"),
]);

const { data: contactSettings } = useFetch<ContactSettingsDto>(
  "/api/contact-settings",
  {
    key: "public-contact-settings",
    default: () => ({
      supportPhone: DEFAULT_SUPPORT_PHONE,
      lineUrl: DEFAULT_SUPPORT_LINE_URL,
      updatedAt: null,
    }),
  },
);

const supportLineUrl = computed(() => {
  const value = String(
    contactSettings.value?.lineUrl || config.public.chatSupportLineUrl || "",
  ).trim();
  return value.length > 0 ? value : null;
});

const supportPhone = computed(() => {
  const value = String(
    contactSettings.value?.supportPhone ||
      config.public.chatSupportPhone ||
      DEFAULT_SUPPORT_PHONE,
  ).trim();
  return value.length > 0 ? value : DEFAULT_SUPPORT_PHONE;
});

const supportPhoneHref = computed(() =>
  supportPhone.value ? `tel:${supportPhone.value.replace(/\s+/g, "")}` : null,
);

const hasGuestSupportOptions = computed(
  () => Boolean(supportLineUrl.value) || Boolean(supportPhoneHref.value),
);

const activeId = computed(() => chat.activeConversation.value?.id ?? null);
const unreadCount = computed(() => {
  const uid = currentUserId.value;
  if (!uid) return 0;
  const fromEntries = chat.unreadEntries.value
    .filter((entry) => !entry.customerId || entry.customerId === uid)
    .reduce((sum, entry) => sum + entry.unreadCount, 0);
  if (fromEntries > 0) return fromEntries;
  return chat.conversations.value
    .filter((item) => item.customerId === uid)
    .reduce((sum, item) => sum + item.unreadCount, 0);
});
const unreadBadgeLabel = computed(() =>
  formatUnreadBadgeCount(unreadCount.value),
);
const canSend = computed(
  () =>
    Boolean(activeId.value) &&
    draftMessage.value.trim().length > 0 &&
    !chat.sending.value &&
    !chat.uploading.value,
);
const remainingChars = computed(
  () => CHAT_MAX_CHARS - draftMessage.value.length,
);

function scrollToBottom() {
  nextTick(() => {
    if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight;
  });
}

function formatUnreadBadgeCount(count: number) {
  return count > 99 ? "99+" : String(count);
}

function formatTime(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat(locale.value, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isCustomerMessage(message: { senderId: string }) {
  const customerId = chat.activeConversation.value?.customerId;
  if (customerId) return message.senderId === customerId;
  return message.senderId === currentUserId.value;
}

function messageSenderLabel(message: { senderId: string }) {
  return isCustomerMessage(message)
    ? t("chatWidget.youLabel")
    : t("chatWidget.supportLabel");
}

function attachmentDisplayName(attachment: {
  fileName: string | null;
  storagePath: string;
}) {
  return (
    attachment.fileName ||
    attachment.storagePath.split("/").filter(Boolean).at(-1) ||
    t("chatWidget.attachment")
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
        // Keep the bubble usable even if preview signing fails.
      }
    }),
  );
}

async function ensureSupportConversation() {
  if (!user.value) return null;
  bootstrapping.value = true;
  try {
    const existing = chat.conversations.value.find(
      (item) =>
        item.customerId === currentUserId.value &&
        item.subjectType === "general" &&
        item.status === "open",
    );
    const conversation =
      existing ?? (await chat.createConversation({ subjectType: "general" }));
    const isReopeningCached =
      chat.activeConversation.value?.id === conversation.id &&
      chat.messages.value.length > 0;
    chat.activeConversation.value = conversation;
    await chat.loadMessages(conversation.id, { silent: isReopeningCached });
    if ((conversation.unreadCount ?? 0) > 0) {
      await chat.markRead(conversation.id);
    }
    chat.subscribe(conversation.id);
    scrollToBottom();
    return conversation;
  } finally {
    bootstrapping.value = false;
  }
}

async function openChat() {
  isOpen.value = true;
  // Position scroll at bottom before the panel paints its first frame —
  // chat.messages.value is already populated from shared useState on reopen,
  // so without this the browser paints at scrollTop=0 and the later async
  // scrollToBottom in ensureSupportConversation looks like a visible jump.
  scrollToBottom();
  if (!user.value) return;
  try {
    await ensureSupportConversation();
  } catch (e) {
    toast.add({
      title: t("chatWidget.sendError"),
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
      icon: "bx:error-circle",
    });
  }
}

function toggleChat() {
  if (isOpen.value) {
    closeChat();
    return;
  }
  void openChat();
}

function closeChat() {
  isOpen.value = false;
  if (user.value) chat.subscribe(null);
}

async function sendMessage(text = draftMessage.value) {
  const body = text.trim();
  if (!body || !user.value) return;
  const conversation =
    chat.activeConversation.value ?? (await ensureSupportConversation());
  if (!conversation) return;
  try {
    draftMessage.value = "";
    await chat.sendMessage(conversation.id, body);
    scrollToBottom();
  } catch (e) {
    draftMessage.value = body;
    toast.add({
      title: t("chatWidget.sendError"),
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
      icon: "bx:error-circle",
    });
  }
}

function triggerFilePicker() {
  if (!user.value) {
    void openChat();
    return;
  }
  fileInputRef.value?.click();
}

async function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !user.value) return;

  const validationError = validateChatUploadFile(file);
  if (validationError) {
    toast.add({
      title: t("chatWidget.uploadError"),
      description: validationError,
      color: "error",
      icon: "bx:error-circle",
    });
    return;
  }

  const conversation =
    chat.activeConversation.value ?? (await ensureSupportConversation());
  if (!conversation) return;

  try {
    await chat.uploadAttachment(conversation.id, file, draftMessage.value);
    draftMessage.value = "";
    await ensureAttachmentPreviews();
    scrollToBottom();
  } catch (e) {
    toast.add({
      title: t("chatWidget.uploadError"),
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
      title: t("chatWidget.openAttachmentError"),
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
      icon: "bx:error-circle",
    });
  }
}

function triggerQuickAction(label: string) {
  void openChat().then(() => sendMessage(label));
}

watch(
  () => currentUserId.value,
  async (userId) => {
    if (!userId) return;
    try {
      await chat.loadUnreadCounts({ silent: true });
    } catch {
      // ignore — badge falls back to cached snapshot
    }
    if (!isOpen.value) {
      chat.subscribe(null);
    }
  },
  { immediate: true },
);

if (import.meta.client) {
  let removeVisibility: (() => void) | null = null;
  onMounted(() => {
    removeVisibility = chat.installVisibilityRefresh();
  });
  onBeforeUnmount(() => {
    removeVisibility?.();
    removeVisibility = null;
  });
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
  <Teleport to="body">
    <div
      v-if="isFabVisible"
      class="fixed bottom-4 left-4 z-40 flex max-w-[calc(100vw-1rem)] flex-col items-start gap-3 sm:bottom-5 sm:left-5"
    >
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-y-3 opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="translate-y-3 opacity-0"
      >
        <div
          v-if="isOpen"
          class="w-[min(25rem,calc(100vw-2rem))] rounded-3xl border border-default bg-white/95 p-4 shadow-2xl backdrop-blur"
        >
          <div class="mb-4 flex items-start justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-default">
                {{ t("chatWidget.panelTitle") }}
              </p>
              <p class="text-xs text-muted">
                {{ t("chatWidget.panelSubtitle") }}
              </p>
            </div>
            <button
              type="button"
              class="rounded-full p-1 text-muted transition hover:bg-neutral-100 hover:text-default"
              @click="closeChat"
            >
              <UIcon name="bx:x" class="size-5" />
            </button>
          </div>

          <div v-if="!user" class="space-y-4 rounded-2xl bg-neutral-50 p-4">
            <p class="text-sm text-default">
              {{ t("chatWidget.loginPrompt") }}
            </p>
            <UButton
              to="/user/login"
              color="primary"
              icon="bx:log-in-circle"
              block
            >
              {{ t("chatWidget.loginButton") }}
            </UButton>

            <div v-if="hasGuestSupportOptions" class="space-y-3">
              <p class="text-xs font-medium text-muted">
                {{ t("chatWidget.otherContactOptions") }}
              </p>

              <div class="grid gap-2 sm:grid-cols-2">
                <UButton
                  v-if="supportLineUrl"
                  :href="supportLineUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  color="success"
                  variant="soft"
                  icon="ri:line-fill"
                  block
                >
                  {{ t("chatWidget.lineButton") }}
                </UButton>

                <UButton
                  v-if="supportPhoneHref"
                  :href="supportPhoneHref"
                  color="neutral"
                  variant="soft"
                  icon="bx:phone-call"
                  block
                >
                  {{ t("chatWidget.callButton") }}
                </UButton>
              </div>
            </div>
          </div>

          <div v-else class="space-y-4">
            <div
              ref="listRef"
              class="flex max-h-80 min-h-56 flex-col overflow-y-auto rounded-2xl bg-neutral-50 p-3"
              style="scroll-behavior: auto"
            >
              <div
                v-if="bootstrapping || chat.loadingMessages.value"
                class="sticky top-0 z-10 -mx-3 -mt-3 bg-neutral-50 px-3 pt-3"
              >
                <div class="h-1 overflow-hidden rounded-full bg-primary/15">
                  <div
                    class="h-full w-full origin-left animate-pulse rounded-full bg-primary"
                  />
                </div>
              </div>
              <div class="mt-auto space-y-3">
                <div
                  v-if="
                    chat.messages.value.length === 0 &&
                    !bootstrapping &&
                    !chat.loadingMessages.value
                  "
                  class="space-y-2 text-sm text-muted"
                >
                  <p>{{ t("chatWidget.welcome") }}</p>
                  <p>{{ t("chatWidget.empty") }}</p>
                </div>
                <div
                  v-for="message in chat.messages.value"
                  :key="message.id"
                  class="flex"
                  :class="
                    isCustomerMessage(message) ? 'justify-end' : 'justify-start'
                  "
                >
                  <div
                    class="flex max-w-[85%] flex-col gap-1"
                    :class="
                      isCustomerMessage(message) ? 'items-end' : 'items-start'
                    "
                  >
                    <p
                      class="text-[10px] font-semibold uppercase tracking-wide"
                      :class="
                        isCustomerMessage(message)
                          ? 'text-primary'
                          : 'text-muted'
                      "
                    >
                      {{ messageSenderLabel(message) }}
                    </p>
                    <div
                      class="rounded-2xl px-3 py-2 text-sm shadow-sm"
                      :class="
                        isCustomerMessage(message)
                          ? 'bg-primary text-default ring-1 ring-primary/30'
                          : 'border border-default bg-white text-default'
                      "
                    >
                      <p
                        v-if="message.body || message.deletedAt"
                        class="whitespace-pre-wrap wrap-anywhere"
                      >
                        {{
                          message.deletedAt ? "Message deleted" : message.body
                        }}
                      </p>
                      <div
                        v-if="message.attachments.length"
                        class="mt-2 space-y-2"
                      >
                        <div
                          v-for="attachment in message.attachments"
                          :key="attachment.id"
                        >
                          <button
                            v-if="attachment.kind === 'image'"
                            type="button"
                            class="group block size-28 overflow-hidden rounded-xl bg-white/70 ring-1 ring-black/10 transition hover:opacity-90"
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
                            class="flex items-center gap-2 rounded-xl bg-white/80 px-2 py-2 text-xs text-default ring-1 ring-black/5"
                          >
                            <UIcon
                              name="bx:file"
                              class="size-4 shrink-0 text-muted"
                            />
                            <span class="flex min-w-0 flex-1 items-baseline">
                              <span class="min-w-0 truncate">
                                {{
                                  attachmentDisplayNameParts(attachment).name
                                }}
                              </span>
                              <span class="shrink-0">
                                {{
                                  attachmentDisplayNameParts(attachment)
                                    .extension
                                }}
                              </span>
                            </span>
                            <button
                              type="button"
                              class="shrink-0 rounded-full bg-primary px-2 py-1 text-[10px] font-semibold text-default transition hover:opacity-90"
                              @click="openMessageAttachment(attachment.id)"
                            >
                              {{ t("chatWidget.downloadButton") }}
                            </button>
                          </div>
                        </div>
                      </div>
                      <p class="mt-1 text-[10px] opacity-70">
                        {{ formatTime(message.createdAt) }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <button
                v-for="action in quickActions"
                :key="action"
                type="button"
                class="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-default transition hover:bg-neutral-200"
                @click="triggerQuickAction(action)"
              >
                {{ action }}
              </button>
            </div>

            <div class="space-y-2">
              <div class="flex items-end gap-2">
                <input
                  ref="fileInputRef"
                  type="file"
                  class="hidden"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  @change="handleFileSelected"
                />
                <button
                  type="button"
                  class="inline-flex items-center justify-center rounded-full border border-default bg-white p-3 text-default shadow-sm transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="chat.uploading.value || bootstrapping"
                  :title="t('chatWidget.uploadButton')"
                  @click="triggerFilePicker"
                >
                  <UIcon
                    :name="chat.uploading.value ? 'bx:loader-alt' : 'bx:plus'"
                    class="size-4"
                  />
                </button>
                <textarea
                  v-model="draftMessage"
                  rows="2"
                  :maxlength="CHAT_MAX_CHARS"
                  class="min-w-0 flex-1 resize-none rounded-2xl border border-default bg-white px-3 py-2 text-sm text-default outline-none transition focus:border-primary"
                  :placeholder="t('chatWidget.inputPlaceholder')"
                  @keydown.enter.exact.prevent="sendMessage()"
                />
                <button
                  type="button"
                  class="inline-flex items-center justify-center rounded-full bg-primary p-3 text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="!canSend"
                  @click="sendMessage()"
                >
                  <UIcon
                    :name="chat.sending.value ? 'bx:loader-alt' : 'bx:send'"
                    class="size-4"
                  />
                </button>
              </div>
              <div
                class="flex items-start justify-between gap-3 text-xs text-muted"
              >
                <span>{{ t("chatWidget.attachmentRules") }}</span>
                <span>{{ remainingChars }}</span>
              </div>
              <p class="text-xs text-muted">{{ t("chatWidget.disclaimer") }}</p>
            </div>
          </div>
        </div>
      </Transition>

      <button
        type="button"
        class="relative inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white shadow-2xl ring-1 ring-primary/20 transition hover:scale-[1.01] hover:opacity-95"
        @click="toggleChat"
      >
        <UIcon name="bx:message-rounded-dots" class="size-5" />
        <span>{{ t("chatWidget.fabLabel") }}</span>
        <span
          v-if="unreadCount > 0"
          class="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-error px-1.5 text-[10px] leading-5 text-white"
        >
          {{ unreadBadgeLabel }}
        </span>
      </button>
    </div>
  </Teleport>
</template>
