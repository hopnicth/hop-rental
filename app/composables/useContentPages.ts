import {
  emptyLocalizedDoc,
  type ContentPage,
  type ContentType,
  type LocalizedDoc,
  type TipTapDoc,
} from "~/types/content";
import type { LocaleCode, LocalizedString } from "~/types/locale";

type ContentPageRow = Record<string, unknown>;

const LOCALES: LocaleCode[] = ["th", "en", "cn", "jp"];

function toString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function localized(
  th: unknown,
  en: unknown,
  cn: unknown,
  jp: unknown,
  fallback = "",
): LocalizedString {
  const thValue = toString(th) || toString(en) || fallback;
  const enValue = toString(en) || toString(th) || fallback;

  return {
    th: thValue,
    en: enValue,
    cn: toString(cn) || enValue,
    jp: toString(jp) || enValue,
  };
}

function asDoc(value: unknown): TipTapDoc {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { type: "doc", content: [] };
  }
  const record = value as Record<string, unknown>;
  if (record.type !== "doc") return { type: "doc", content: [] };
  return {
    type: "doc",
    content: Array.isArray(record.content) ? record.content : [],
  };
}

function normalizeBody(value: unknown): LocalizedDoc {
  const result = emptyLocalizedDoc();
  if (!value || typeof value !== "object" || Array.isArray(value))
    return result;
  const record = value as Record<string, unknown>;
  for (const locale of LOCALES) {
    result[locale] = asDoc(record[locale]);
  }
  return result;
}

function normalizeContentPage(row: ContentPageRow): ContentPage | null {
  const id = toString(row.id);
  const contentType = toString(row.content_type) as ContentType;
  const slug = toString(row.slug);
  if (!id || !slug || !["blog", "service", "promotion"].includes(contentType)) {
    return null;
  }

  const fallbackTitle =
    toString(row.title_th) || toString(row.title_en) || slug;

  return {
    id,
    contentType,
    slug,
    title: localized(
      row.title_th,
      row.title_en,
      row.title_cn,
      row.title_jp,
      fallbackTitle,
    ),
    excerpt: localized(
      row.excerpt_th,
      row.excerpt_en,
      row.excerpt_cn,
      row.excerpt_jp,
      fallbackTitle,
    ),
    coverImageUrl: toString(row.cover_image_url),
    body: normalizeBody(row.blocks),
    sortOrder: Number(row.sort_order ?? 0),
    isActive: row.is_active !== false,
    publishedAt: toString(row.published_at),
    createdAt: toString(row.created_at),
    updatedAt: toString(row.updated_at),
  };
}

export function useContentPages() {
  const supabase = useSupabaseClient();

  async function fetchContentPages(contentType: ContentType) {
    const { data, error } = await supabase
      .from("content_pages")
      .select(
        "id, content_type, slug, title_th, title_en, title_cn, title_jp, excerpt_th, excerpt_en, excerpt_cn, excerpt_jp, cover_image_url, blocks, sort_order, is_active, published_at, created_at, updated_at",
      )
      .eq("content_type", contentType)
      .order("sort_order", { ascending: true })
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    return ((data ?? []) as unknown[])
      .map((row) => normalizeContentPage(row as ContentPageRow))
      .filter((item): item is ContentPage => !!item);
  }

  async function fetchContentPage(contentType: ContentType, slug: string) {
    const { data, error } = await supabase
      .from("content_pages")
      .select(
        "id, content_type, slug, title_th, title_en, title_cn, title_jp, excerpt_th, excerpt_en, excerpt_cn, excerpt_jp, cover_image_url, blocks, sort_order, is_active, published_at, created_at, updated_at",
      )
      .eq("content_type", contentType)
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw error;
    return data ? normalizeContentPage(data as ContentPageRow) : null;
  }

  function pathForContent(contentType: ContentType, slug: string) {
    if (contentType === "service") return `/services/${slug}`;
    if (contentType === "promotion") return `/promotions/${slug}`;
    return `/blog/${slug}`;
  }

  return { fetchContentPages, fetchContentPage, pathForContent };
}
