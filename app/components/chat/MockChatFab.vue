<script setup lang="ts">
type ChatMessage = {
  id: number;
  role: "assistant" | "user";
  text: string;
};

const { t, locale } = useI18n();

const isOpen = ref(false);
const draftMessage = ref("");
const nextMessageId = ref(1);
const messages = ref<ChatMessage[]>([]);

const quickActions = computed(() => [
  {
    label: t("chatWidget.actions.products"),
    reply: t("chatWidget.replies.products"),
  },
  {
    label: t("chatWidget.actions.rental"),
    reply: t("chatWidget.replies.rental"),
  },
  {
    label: t("chatWidget.actions.quote"),
    reply: t("chatWidget.replies.quote"),
  },
]);

function pushMessage(role: ChatMessage["role"], text: string) {
  messages.value.push({ id: nextMessageId.value++, role, text });
}

function resetConversation() {
  nextMessageId.value = 1;
  messages.value = [];
  pushMessage("assistant", t("chatWidget.welcome"));
}

function openChat() {
  isOpen.value = true;
}

function toggleChat() {
  isOpen.value = !isOpen.value;
}

function triggerQuickAction(label: string, reply: string) {
  openChat();
  pushMessage("user", label);
  pushMessage("assistant", reply);
}

function sendMockMessage() {
  const text = draftMessage.value.trim();
  if (!text) return;

  openChat();
  pushMessage("user", text);
  pushMessage("assistant", t("chatWidget.mockReply"));
  draftMessage.value = "";
}

watch(locale, resetConversation, { immediate: true });
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed bottom-4 left-4 z-[999] flex max-w-[calc(100vw-1rem)] flex-col items-start gap-3 sm:bottom-5 sm:left-5"
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
          class="w-[min(24rem,calc(100vw-2rem))] rounded-3xl border border-default bg-white/95 p-4 shadow-2xl backdrop-blur"
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
              @click="isOpen = false"
            >
              <UIcon name="bx:x" class="size-5" />
            </button>
          </div>

          <div class="space-y-4">
            <div class="max-h-72 space-y-3 overflow-y-auto pr-1">
              <div
                v-for="message in messages"
                :key="message.id"
                class="flex"
                :class="
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                "
              >
                <div
                  class="max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm"
                  :class="
                    message.role === 'user'
                      ? 'bg-primary text-inverted'
                      : 'bg-neutral-100 text-default'
                  "
                >
                  {{ message.text }}
                </div>
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <button
                v-for="action in quickActions"
                :key="action.label"
                type="button"
                class="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-default transition hover:bg-neutral-200"
                @click="triggerQuickAction(action.label, action.reply)"
              >
                {{ action.label }}
              </button>
            </div>

            <div class="flex items-center gap-2">
              <input
                v-model="draftMessage"
                type="text"
                class="min-w-0 flex-1 rounded-2xl border border-default bg-white px-3 py-2 text-sm text-default outline-none transition focus:border-primary"
                :placeholder="t('chatWidget.inputPlaceholder')"
                @keyup.enter="sendMockMessage"
              />

              <button
                type="button"
                class="inline-flex items-center justify-center rounded-full bg-primary p-3 text-white shadow-sm transition hover:opacity-90"
                @click="sendMockMessage"
              >
                <UIcon name="bx:send" class="size-4" />
              </button>
            </div>

            <p class="text-xs text-muted">
              {{ t("chatWidget.disclaimer") }}
            </p>
          </div>
        </div>
      </Transition>

      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white shadow-2xl ring-1 ring-primary/20 transition hover:scale-[1.01] hover:opacity-95"
        @click="toggleChat"
      >
        <UIcon name="bx:message-rounded-dots" class="size-5" />
        <span>{{ t("chatWidget.fabLabel") }}</span>
      </button>
    </div>
  </Teleport>
</template>
