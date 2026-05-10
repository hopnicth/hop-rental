import { describe, expect, it } from "vitest";
import {
  buildServiceProviderPayload,
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
    expect(payload.provider_id).toBeNull();
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
    expect(row.providerId).toBe("");
    expect(row.serviceProvider).toBeNull();
    expect(row.body.th).toEqual({ type: "doc", content: [] });
  });

  it("normalizes service provider payloads and KYC documents", () => {
    const pagePayload = buildContentPagePayload({
      contentType: "service",
      slug: "kyc-service",
      titleTh: "บริการ",
      titleEn: "Service",
      excerptTh: "สรุป",
      excerptEn: "Summary",
      serviceProvider: {
        providerId: "1-2345-67890-12-3",
      },
    });
    const providerPayload = buildServiceProviderPayload({
      contentType: "service",
      serviceProvider: {
        providerId: "1-2345-67890-12-3",
        providerType: "individual",
        isVerified: true,
        contactPhone: "02-123-4567",
        contactEmail: "provider@example.com",
        googleMapsUrl: "https://maps.google.com/example",
        kycDocuments: {
          citizenCard: {
            path: "content-pages/file/2026-05-10/id-card.pdf",
            url: "https://example.test/id-card.pdf",
            filename: "id-card.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1200,
          },
          companyCertificate: {
            path: "content-pages/file/company.pdf",
          },
        },
      },
    });

    expect(pagePayload.provider_id).toBe("1234567890123");
    expect(providerPayload).toMatchObject({
      provider_id: "1234567890123",
      provider_type: "individual",
      is_verified: true,
      contact_phone: "02-123-4567",
      contact_email: "provider@example.com",
      google_maps_url: "https://maps.google.com/example",
    });
    expect(providerPayload?.kyc_documents).toEqual({
      citizenCard: expect.objectContaining({
        path: "content-pages/file/2026-05-10/id-card.pdf",
        filename: "id-card.pdf",
      }),
    });
  });

  it("maps service provider rows for admin content", () => {
    const row = mapContentPageRow({
      id: "content-2",
      content_type: "service",
      slug: "verified-service",
      title_th: "บริการยืนยันแล้ว",
      title_en: "Verified service",
      excerpt_th: "สรุป",
      excerpt_en: "Summary",
      blocks: null,
      is_active: true,
      sort_order: 1,
      provider_id: "1234567890123",
      content_page_products: [],
      content_page_assets: [],
      service_providers: {
        provider_id: "1234567890123",
        provider_type: "company",
        is_verified: true,
        contact_phone: "099-999-9999",
        contact_email: "company@example.com",
        google_maps_url: "https://maps.google.com/company",
        kyc_documents: {
          companyCertificate: {
            path: "content-pages/file/company.pdf",
          },
        },
      },
    });

    expect(row.providerId).toBe("1234567890123");
    expect(row.serviceProvider).toMatchObject({
      providerId: "1234567890123",
      providerType: "company",
      isVerified: true,
      contactPhone: "099-999-9999",
    });
    expect(row.serviceProvider?.kycDocuments).toEqual({
      companyCertificate: expect.objectContaining({
        path: "content-pages/file/company.pdf",
      }),
    });
  });
});
