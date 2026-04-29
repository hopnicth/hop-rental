export type ChatSubjectType =
  | "general"
  | "product"
  | "asset"
  | "order"
  | "rental_booking";

export type ChatConversationStatus = "open" | "closed" | "archived";
export type ChatParticipantRole =
  | "customer"
  | "staff"
  | "super_admin"
  | "system";
export type ChatMessageType = "text" | "attachment" | "system";
export type ChatAttachmentKind = "image" | "document";

export interface ChatAttachmentDto {
  id: string;
  messageId: string;
  storageBucket: string;
  storagePath: string;
  fileName: string | null;
  mimeType: string;
  fileSize: number;
  kind: ChatAttachmentKind;
  createdAt: string;
}

export interface ChatMessageDto {
  id: string;
  conversationId: string;
  senderId: string;
  messageType: ChatMessageType;
  body: string | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  attachments: ChatAttachmentDto[];
}

export interface ChatConversationCustomerDto {
  id: string;
  fullName: string | null;
  phone: string | null;
}

export interface ChatConversationDto {
  id: string;
  subjectType: ChatSubjectType;
  subjectId: string | null;
  customerId: string | null;
  status: ChatConversationStatus;
  lastMessageId: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  archivedAt: string | null;
  participantRole: ChatParticipantRole | null;
  lastReadAt: string | null;
  unreadCount: number;
  customer: ChatConversationCustomerDto | null;
  lastMessage: ChatMessageDto | null;
}

export interface ChatConversationsResponse {
  items: ChatConversationDto[];
  pageSize: number;
}

export interface ChatUnreadEntry {
  conversationId: string;
  customerId: string | null;
  unreadCount: number;
  lastReadAt: string | null;
  updatedAt: string;
}

export interface ChatUnreadCountsResponse {
  items: ChatUnreadEntry[];
  totalUnread: number;
  fetchedAt: string;
}

export interface ChatMessagesResponse {
  items: ChatMessageDto[];
  pageSize: number;
  hasMore: boolean;
  nextBefore: string | null;
}

export interface CreateChatMessagePayload {
  body?: string | null;
  messageType?: "text" | "attachment";
}

export interface CreateChatConversationPayload {
  subjectType?: ChatSubjectType;
  subjectId?: string | null;
  initialMessage?: string | null;
  customerId?: string | null;
}

export interface CreateChatAttachmentPayload {
  storageBucket?: string;
  storagePath: string;
  fileName?: string | null;
  mimeType: string;
  fileSize: number;
}
