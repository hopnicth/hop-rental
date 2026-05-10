import type { LocaleCode, LocalizedString } from "~/types/locale";

export type ContentType = "blog" | "service" | "promotion" | "review";
export type ServiceProviderType = "individual" | "company";

export interface KycDocument {
  path: string;
  url?: string;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  uploadedAt?: string;
}

export type KycDocuments = Record<string, KycDocument | undefined>;

export interface ServiceProvider {
  providerId: string;
  providerType: ServiceProviderType;
  isVerified: boolean;
  contactPhone: string;
  contactEmail: string;
  googleMapsUrl: string;
  lineId: string;
  lineUrl: string;
  kycDocuments?: KycDocuments;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Minimal TipTap / ProseMirror document shape.
 * Editor produces full JSON; we keep typing loose so any valid TipTap doc fits.
 */
export interface TipTapDoc {
  type: "doc";
  content?: unknown[];
}

export type LocalizedDoc = Record<LocaleCode, TipTapDoc>;

export const EMPTY_TIPTAP_DOC: TipTapDoc = { type: "doc", content: [] };

export function emptyLocalizedDoc(): LocalizedDoc {
  return {
    th: { type: "doc", content: [] },
    en: { type: "doc", content: [] },
    cn: { type: "doc", content: [] },
    jp: { type: "doc", content: [] },
  };
}

export interface ContentPage {
  id: string;
  contentType: ContentType;
  slug: string;
  mainCategoryKey: string;
  providerId: string;
  title: LocalizedString;
  excerpt: LocalizedString;
  coverImageUrl: string;
  body: LocalizedDoc;
  serviceAreas: string[];
  linkedProductIds: string[];
  linkedAssetIds: string[];
  serviceProvider: ServiceProvider | null;
  sortOrder: number;
  isActive: boolean;
  publishedAt: string;
  createdAt?: string;
  updatedAt?: string;
}
