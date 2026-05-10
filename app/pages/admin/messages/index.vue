<script setup lang="ts">
import type { ChatConversationDto } from "~/types/chat";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

const chat = useChat();
const search = ref("");
const initialLoaded = ref(false);

const filteredConversations = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  if (!keyword) return chat.conversations.value;
  return chat.conversations.value.filter((item) =>
    [
      item.customer?.fullName,
      item.customer?.phone,
      item.subjectType,
      item.subjectId,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(keyword),
  );
});

function customerLabel(item: ChatConversationDto) {
  return (
    item.customer?.fullName ||
    item.customer?.phone ||
    `Customer ${item.customerId?.slice(0, 8) ?? "-"}`
  );
}

function preview(item: ChatConversationDto) {
  return item.lastMessage?.body || "No messages yet";
}

function formatDate(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

if (import.meta.client) {
  onMounted(async () => {
    try {
      await chat.loadConversations({ limit: 50 });
    } finally {
      initialLoaded.value = true;
    }
    chat.subscribe(null);
  });
}
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <div
          class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
        >
          <div>
            <h2 class="text-xl font-semibold">Messages</h2>
            <p class="text-sm text-muted">
              Customer support inbox powered by Supabase chat.
            </p>
          </div>
          <UButton
            color="primary"
            variant="soft"
            icon="bx:refresh"
            :loading="chat.loadingConversations.value"
            @click="chat.loadConversations({ limit: 50 })"
          >
            Refresh
          </UButton>
        </div>
      </template>

      <div class="space-y-4">
        <UInput
          v-model="search"
          icon="bx:search"
          class="w-full"
          placeholder="Search by customer, phone, subject..."
        />

        <UAlert
          v-if="chat.error.value"
          color="error"
          variant="soft"
          title="Could not load messages"
          :description="chat.error.value"
        />

        <div
          v-if="!initialLoaded && chat.loadingConversations.value"
          class="space-y-2"
        >
          <div
            v-for="n in 5"
            :key="n"
            class="flex items-start justify-between gap-4 rounded-2xl border border-default bg-white p-4"
          >
            <div class="min-w-0 flex-1 space-y-2">
              <div class="h-4 w-1/3 animate-pulse rounded bg-neutral-100" />
              <div class="h-3 w-2/3 animate-pulse rounded bg-neutral-100" />
              <div class="h-3 w-1/4 animate-pulse rounded bg-neutral-100" />
            </div>
            <div class="h-3 w-16 animate-pulse rounded bg-neutral-100" />
          </div>
        </div>
        <div
          v-else-if="filteredConversations.length === 0"
          class="rounded-2xl border border-dashed p-8 text-center text-sm text-muted"
        >
          No support conversations yet.
        </div>

        <div
          v-else
          class="divide-y divide-default overflow-hidden rounded-2xl border border-default"
        >
          <NuxtLink
            v-for="item in filteredConversations"
            :key="item.id"
            :to="`/admin/messages/${item.id}`"
            class="block bg-white p-4 transition hover:bg-neutral-50"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0 space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="truncate font-semibold text-default">
                    {{ customerLabel(item) }}
                  </h3>
                  <UBadge
                    v-if="item.unreadCount"
                    color="error"
                    variant="solid"
                    size="xs"
                  >
                    New
                  </UBadge>
                  <UBadge color="neutral" variant="soft" size="xs">
                    {{ item.status }}
                  </UBadge>
                </div>
                <p class="line-clamp-2 text-sm text-muted">
                  {{ preview(item) }}
                </p>
                <p class="text-xs text-muted">
                  {{ item.subjectType
                  }}<span v-if="item.subjectId"> · {{ item.subjectId }}</span>
                </p>
              </div>
              <p class="shrink-0 text-xs text-muted">
                {{ formatDate(item.updatedAt) }}
              </p>
            </div>
          </NuxtLink>
        </div>
      </div>
    </UCard>
  </div>
</template>
