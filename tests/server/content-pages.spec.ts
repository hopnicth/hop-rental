import { describe, expect, it } from "vitest";
import {
  buildContentPagePayload,
  mapContentPageRow,
  normalizeLocalizedBody,
} from "../../server/utils/content-pages";

describe("content page payload helpers", () => {
  it("normalizes core content page fields and localized body", () => {
    const payload = buildContentPagePayload({
      contentType: "service",
      slug: " Engineering Design!! ",
      titleTh: "บริการออกแบบ",
      titleEn: "Engineering Design",
      excerptTh: "คำอธิบายสั้น",
      excerptEn: "Short excerpt",
      coverImageUrl: "",
      sortOrder: 3,
      isActive: true,
      publishedAt: "2026-04-27T09:00:00Z",
      mainCategoryKey: " Safety Services ",
      body: {
        th: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "สวัสดี" }],
            },
          ],
        },
      },
    });

    expect(payload.content_type).toBe("service");
    expect(payload.slug).toBe("engineering-design");
    expect(payload.main_category_key).toBe("safety_services");
    expect(payload.cover_image_url).toBeNull();
    expect(payload.blocks.th).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "สวัสดี" }] },
      ],
    });
    expect(payload.blocks.en).toEqual({ type: "doc", content: [] });
    expect(payload.blocks.cn).toEqual({ type: "doc", content: [] });
    expect(payload.blocks.jp).toEqual({ type: "doc", content: [] });
  });

  it("returns empty docs for legacy or invalid body data", () => {
    expect(normalizeLocalizedBody(null)).toEqual({
      th: { type: "doc", content: [] },
      en: { type: "doc", content: [] },
      cn: { type: "doc", content: [] },
      jp: { type: "doc", content: [] },
    });
    expect(normalizeLocalizedBody([{ type: "heading" }])).toEqual({
      th: { type: "doc", content: [] },
      en: { type: "doc", content: [] },
      cn: { type: "doc", content: [] },
      jp: { type: "doc", content: [] },
    });
  });

  it("maps admin content rows with main category keys", () => {
    const row = mapContentPageRow({
      id: "content-1",
      content_type: "blog",
      slug: "safety-guide",
      main_category_key: "safety",
      title_th: "คู่มือความปลอดภัย",
      title_en: "Safety guide",
      excerpt_th: "สรุป",
      excerpt_en: "Summary",
      blocks: null,
      is_active: true,
      sort_order: 10,
      content_page_products: [],
      content_page_assets: [],
    });

    expect(row.mainCategoryKey).toBe("safety");
    expect(row.body.th).toEqual({ type: "doc", content: [] });
  });
});
