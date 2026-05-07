import type { LocalizedString } from "~/types/locale";

export type HomeLinkSection = "promotion" | "service";
export type HomeLinkTarget = "_blank" | "_self";

export interface HomeLinkCard {
  id: string;
  contentPageId?: string;
  sectionKey: HomeLinkSection;
  title: LocalizedString;
  description: LocalizedString;
  imageUrl: string;
  linkUrl: string;
  linkTarget?: HomeLinkTarget;
  sortOrder: number;
  isActive: boolean;
}

export interface HomeFeaturedProduct {
  id: string;
  productId: string;
  sortOrder: number;
  isActive: boolean;
}

export interface HomeFeaturedAsset {
  id: string;
  assetId: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ServicePageContent {
  slug: string;
  title: LocalizedString;
  summary: LocalizedString;
  intro: LocalizedString;
  bullets: LocalizedString[];
  ctaLabel: LocalizedString;
  ctaHref: string;
}
