import type { LocaleCode, LocalizedString } from "~/types/locale";

export type ContentType = "blog" | "service" | "promotion" | "review";

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
  title: LocalizedString;
  excerpt: LocalizedString;
  coverImageUrl: string;
  body: LocalizedDoc;
  serviceAreas: string[];
  linkedProductIds: string[];
  linkedAssetIds: string[];
  sortOrder: number;
  isActive: boolean;
  publishedAt: string;
  createdAt?: string;
  updatedAt?: string;
}
