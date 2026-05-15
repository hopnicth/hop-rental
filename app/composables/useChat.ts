import type {
  ChatAttachmentDto,
  ChatConversationDto,
  ChatConversationsResponse,
  ChatMessagesResponse,
  ChatMessageDto,
  ChatUnreadCountsResponse,
  ChatUnreadEntry,
  CreateChatConversationPayload,
} from "~/types/chat";

type RealtimeChannel = ReturnType<
  ReturnType<typeof useSupabaseClient>["channel"]
>;
type ChatNuxtApp = ReturnType<typeof useNuxtApp> & {
  __chatRealtimeAuthSynced?: boolean;
};
type RealtimeAuthCapable = {
  realtime?: {
    setAuth?: (token: string | null) => void;
  };
};
type AuthUserLike = {
  id?: string;
  sub?: string;
} | null;
type RealtimeMessageRow = {
  conversation_id?: string | null;
  sender_id?: string | null;
};
type RealtimeMessagePayload = {
  eventType?: string;
  new?: RealtimeMessageRow | null;
};

const STORAGE_KEY = "chat:unread-snapshot";
const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
const REALTIME_REFRESH_DEBOUNCE_MS = 200;

let realtimeChannel: RealtimeChannel | null = null;
let realtimeKey: string | null = null;
let realtimeIntentionalClose = false;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const CHAT_ALLOWED_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

export function validateChatUploadFile(file: File): string | null {
  if (!CHAT_ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
    return "Only JPG, PNG, WebP, and PDF files are allowed.";
  }
  const maxBytes = file.type.startsWith("image/")
    ? CHAT_IMAGE_MAX_BYTES
    : CHAT_DOCUMENT_MAX_BYTES;
  if (file.size > maxBytes) {
    return file.type.startsWith("image/")
      ? "Images must be 5 MB or smaller."
      : "PDF files must be 10 MB or smaller.";
  }
  return null;
}

interface CachedUnreadSnapshot {
  fetchedAt: string;
  totalUnread: number;
  items: ChatUnreadEntry[];
}

function readCachedSnapshot(): CachedUnreadSnapshot | null {
  if (!import.meta.client) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedUnreadSnapshot;
    if (!parsed || typeof parsed !== "object" || !parsed.fetchedAt) return null;
    if (Date.now() - Date.parse(parsed.fetchedAt) > SNAPSHOT_TTL_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedSnapshot(snapshot: CachedUnreadSnapshot) {
  if (!import.meta.client) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // localStorage may be disabled or quota-exceeded; cache is best-effort only.
  }
}

function getAuthUserId(user: AuthUserLike): string | null {
  if (!user) return null;
  if (typeof user.id === "string" && user.id.length > 0) return user.id;
  if (typeof user.sub === "string" && user.sub.length > 0) return user.sub;
  return null;
}

export function useChat() {
  const supabase = useSupabaseClient();
  const supabaseUser = useSupabaseUser();
  const supabaseSession = useSupabaseSession();
  const nuxtApp = useNuxtApp() as ChatNuxtApp;
  const realtimeClient = supabase as typeof supabase & RealtimeAuthCapable;
  if (import.meta.client && !nuxtApp.__chatRealtimeAuthSynced) {
    nuxtApp.__chatRealtimeAuthSynced = true;
    try {
      supabase.auth.onAuthStateChange((_event, session) => {
        try {
          realtimeClient.realtime?.setAuth?.(session?.access_token ?? null);
        } catch {
          // Ignore realtime auth sync failures; polling still keeps chat usable.
        }
      });
    } catch {
      // Ignore auth state listener setup failures in non-critical environments.
    }
  }
  const conversations = useState<ChatConversationDto[]>(
    "chat:conversations",
    () => [],
  );
  const activeConversation = useState<ChatConversationDto | null>(
    "chat:active",
    () => null,
  );
  const messages = useState<ChatMessageDto[]>("chat:messages", () => []);
  const unreadEntries = useState<ChatUnreadEntry[]>(
    "chat:unread-entries",
    () => readCachedSnapshot()?.items ?? [],
  );
  const unreadFetchedAt = useState<string | null>(
    "chat:unread-fetched-at",
    () => readCachedSnapshot()?.fetchedAt ?? null,
  );
  const loadingConversations = useState<boolean>(
    "chat:loading-conversations",
    () => false,
  );
  const loadingMessages = useState<boolean>(
    "chat:loading-messages",
    () => false,
  );
  const loadingUnread = useState<boolean>("chat:loading-unread", () => false);
  const sending = useState<boolean>("chat:sending", () => false);
  const uploading = useState<boolean>("chat:uploading", () => false);
  const error = useState<string | null>("chat:error", () => null);
  const channelStatus = useState<string>("chat:channel-status", () => "idle");

  const totalUnread = computed(() =>
    unreadEntries.value.reduce((sum, entry) => sum + entry.unreadCount, 0),
  );

  function persistSnapshot(items: ChatUnreadEntry[]) {
    const fetchedAt = new Date().toISOString();
    unreadFetchedAt.value = fetchedAt;
    writeCachedSnapshot({
      fetchedAt,
      totalUnread: items.reduce((sum, entry) => sum + entry.unreadCount, 0),
      items,
    });
  }

  function syncUnreadFromConversations(items: ChatConversationDto[]) {
    const next: ChatUnreadEntry[] = items.map((item) => ({
      conversationId: item.id,
      customerId: item.customerId,
      unreadCount: item.unreadCount ?? 0,
      lastReadAt: item.lastReadAt,
      updatedAt: item.updatedAt,
    }));
    unreadEntries.value = next;
    persistSnapshot(next);
  }

  async function loadConversations(
    params: { status?: string; limit?: number; silent?: boolean } = {},
  ) {
    if (!params.silent) loadingConversations.value = true;
    error.value = null;
    try {
      const response = await $fetch<ChatConversationsResponse>(
        "/api/chat/conversations",
        { query: { limit: params.limit ?? 30, status: params.status } },
      );
      conversations.value = response.items;
      if (activeConversation.value) {
        activeConversation.value =
          response.items.find(
            (item) => item.id === activeConversation.value?.id,
          ) ?? activeConversation.value;
      }
      syncUnreadFromConversations(response.items);
      return response.items;
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : "Failed to load conversations";
      throw e;
    } finally {
      if (!params.silent) loadingConversations.value = false;
    }
  }

  async function loadUnreadCounts(options: { silent?: boolean } = {}) {
    if (!options.silent) loadingUnread.value = true;
    try {
      const response = await $fetch<ChatUnreadCountsResponse>(
        "/api/chat/unread-counts",
      );
      unreadEntries.value = response.items;
      unreadFetchedAt.value = response.fetchedAt;
      writeCachedSnapshot({
        fetchedAt: response.fetchedAt,
        totalUnread: response.totalUnread,
        items: response.items,
      });
      return response;
    } finally {
      if (!options.silent) loadingUnread.value = false;
    }
  }

  async function createConversation(
    payload: CreateChatConversationPayload = {},
  ) {
    error.value = null;
    const response = await $fetch<{
      item: ChatConversationDto;
      created: boolean;
    }>("/api/chat/conversations", { method: "POST", body: payload });
    activeConversation.value = response.item;
    if (!conversations.value.some((item) => item.id === response.item.id)) {
      conversations.value = [response.item, ...conversations.value];
    }
    return response.item;
  }

  async function loadMessages(
    conversationId: string,
    options: { silent?: boolean } = {},
  ) {
    if (!options.silent) loadingMessages.value = true;
    error.value = null;
    try {
      const response = await $fetch<ChatMessagesResponse>(
        `/api/chat/conversations/${conversationId}/messages`,
      );
      messages.value = response.items;
      return response.items;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load messages";
      throw e;
    } finally {
      if (!options.silent) loadingMessages.value = false;
    }
  }

  async function sendMessage(conversationId: string, body: string) {
    const text = body.trim();
    if (!text) return null;
    sending.value = true;
    error.value = null;
    try {
      const response = await $fetch<{ item: ChatMessageDto }>(
        `/api/chat/conversations/${conversationId}/messages`,
        { method: "POST", body: { messageType: "text", body: text } },
      );
      messages.value = [...messages.value, response.item];
      return response.item;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to send message";
      throw e;
    } finally {
      sending.value = false;
    }
  }

  async function uploadAttachment(
    conversationId: string,
    file: File,
    caption?: string | null,
  ) {
    const validationError = validateChatUploadFile(file);
    if (validationError) throw new Error(validationError);

    uploading.value = true;
    error.value = null;
    try {
      const messageResponse = await $fetch<{ item: ChatMessageDto }>(
        `/api/chat/conversations/${conversationId}/messages`,
        {
          method: "POST",
          body: {
            messageType: "attachment",
            body: caption?.trim() || null,
          },
        },
      );
      const formData = new FormData();
      formData.append("file", file, file.name);
      await $fetch<{ item: ChatAttachmentDto }>(
        `/api/chat/messages/${messageResponse.item.id}/attachments/upload`,
        { method: "POST", body: formData },
      );
      await loadMessages(conversationId, { silent: true });
      return messageResponse.item;
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : "Failed to upload attachment";
      throw e;
    } finally {
      uploading.value = false;
    }
  }

  async function getAttachmentSignedUrl(attachmentId: string) {
    const response = await $fetch<{ signedUrl: string }>(
      `/api/chat/attachments/${attachmentId}/signed-url`,
    );
    return response.signedUrl;
  }

  async function openAttachment(attachment: ChatAttachmentDto) {
    const signedUrl = await getAttachmentSignedUrl(attachment.id);
    if (import.meta.client) window.open(signedUrl, "_blank", "noopener");
    return signedUrl;
  }

  async function markRead(conversationId: string) {
    await $fetch(`/api/chat/conversations/${conversationId}/read`, {
      method: "PATCH",
    });
    const now = new Date().toISOString();
    conversations.value = conversations.value.map((item) =>
      item.id === conversationId
        ? { ...item, unreadCount: 0, lastReadAt: now }
        : item,
    );
    const nextEntries = unreadEntries.value.map((entry) =>
      entry.conversationId === conversationId
        ? { ...entry, unreadCount: 0, lastReadAt: now }
        : entry,
    );
    unreadEntries.value = nextEntries;
    persistSnapshot(nextEntries);
  }

  function bumpUnreadFor(conversationId: string) {
    const existingIndex = unreadEntries.value.findIndex(
      (entry) => entry.conversationId === conversationId,
    );
    let next: ChatUnreadEntry[];
    if (existingIndex === -1) {
      const conv = conversations.value.find(
        (item) => item.id === conversationId,
      );
      next = [
        ...unreadEntries.value,
        {
          conversationId,
          customerId: conv?.customerId ?? null,
          unreadCount: 1,
          lastReadAt: conv?.lastReadAt ?? null,
          updatedAt: new Date().toISOString(),
        },
      ];
    } else {
      next = unreadEntries.value.map((entry, index) =>
        index === existingIndex
          ? { ...entry, unreadCount: entry.unreadCount + 1 }
          : entry,
      );
    }
    unreadEntries.value = next;
    conversations.value = conversations.value.map((item) =>
      item.id === conversationId
        ? { ...item, unreadCount: (item.unreadCount ?? 0) + 1 }
        : item,
    );
    persistSnapshot(next);
  }

  function scheduleRefresh(conversationId?: string | null) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      if (conversationId) {
        void loadMessages(conversationId, { silent: true }).catch(() => {});
      }
      void loadConversations({ silent: true }).catch(() => {});
    }, REALTIME_REFRESH_DEBOUNCE_MS);
  }

  function stopRealtime() {
    if (!realtimeChannel) return;
    realtimeIntentionalClose = true;
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
    realtimeKey = null;
    channelStatus.value = "idle";
  }

  async function subscribe(conversationId?: string | null) {
    if (import.meta.server) return;
    let userId =
      getAuthUserId(supabaseUser.value as AuthUserLike) ??
      supabaseSession.value?.user?.id ??
      null;
    let accessToken: string | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      accessToken = data.session?.access_token ?? null;
      if (!userId && data.session?.user?.id) userId = data.session.user.id;
    } catch {
      accessToken = null;
    }
    if (accessToken) {
      try {
        realtimeClient.realtime?.setAuth?.(accessToken);
      } catch {
        // Ignore realtime auth sync failures; the channel will still reconnect.
      }
    }
    const channelName = conversationId
      ? `chat-conversation-${conversationId}`
      : "chat-conversations";
    if (realtimeChannel && realtimeKey === channelName) return;
    if (realtimeChannel) {
      realtimeIntentionalClose = true;
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    realtimeKey = channelName;
    realtimeChannel = supabase.channel(channelName);
    realtimeChannel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "chat_messages",
        ...(conversationId
          ? { filter: `conversation_id=eq.${conversationId}` }
          : {}),
      },
      (payload: RealtimeMessagePayload) => {
        const eventType = String(payload?.eventType ?? "");
        const newRow = payload?.new ?? null;
        const targetConversationId =
          (newRow && String(newRow.conversation_id ?? "")) || null;
        const isOwnInsert =
          eventType === "INSERT" &&
          userId &&
          String(newRow?.sender_id ?? "") === userId;

        // The sender already appended its own message optimistically in
        // sendMessage()/uploadAttachment(). Let the chat_conversations realtime
        // event refresh list metadata later; do not refetch messages/list here.
        if (isOwnInsert) return;

        if (
          eventType === "INSERT" &&
          targetConversationId &&
          userId &&
          String(newRow.sender_id ?? "") !== userId
        ) {
          if (conversationId && conversationId === targetConversationId) {
            // Panel is open and viewing this conversation — clear badge instead.
            void markRead(targetConversationId).catch(() => {});
          } else {
            bumpUnreadFor(targetConversationId);
          }
        }
        scheduleRefresh(conversationId ?? null);
      },
    );
    realtimeChannel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "chat_conversations" },
      () => {
        // Conversation updates are list metadata only (last_message_id,
        // updated_at, status). Message INSERT events above are responsible for
        // refreshing the active message thread when needed.
        scheduleRefresh(null);
      },
    );
    realtimeChannel.subscribe((status: string) => {
      channelStatus.value = status;
      if (status === "SUBSCRIBED") {
        realtimeIntentionalClose = false;
        return;
      }
      if (status === "CLOSED" && realtimeIntentionalClose) {
        realtimeIntentionalClose = false;
        return;
      }
      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        // eslint-disable-next-line no-console
        console.warn(`[chat] realtime channel ${channelName}: ${status}`);
      }
    });
  }

  function installVisibilityRefresh() {
    if (!import.meta.client) return () => {};
    const handler = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void loadUnreadCounts({ silent: true }).catch(() => {});
    };
    document.addEventListener("visibilitychange", handler);
    window.addEventListener("focus", handler);
    return () => {
      document.removeEventListener("visibilitychange", handler);
      window.removeEventListener("focus", handler);
    };
  }

  return {
    conversations,
    activeConversation,
    messages,
    unreadEntries,
    unreadFetchedAt,
    totalUnread,
    loadingConversations,
    loadingMessages,
    loadingUnread,
    sending,
    uploading,
    error,
    channelStatus,
    loadConversations,
    loadUnreadCounts,
    createConversation,
    loadMessages,
    sendMessage,
    uploadAttachment,
    getAttachmentSignedUrl,
    openAttachment,
    markRead,
    subscribe,
    stopRealtime,
    installVisibilityRefresh,
  };
}
