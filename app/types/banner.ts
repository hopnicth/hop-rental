import type { LocalizedString } from "~/types/locale";

/**
 * Banner slide data structure for the homepage hero.
 */
export interface BannerSlide {
  /** Unique identifier (from DB in future) */
  id: string;
  /** Headline shown on top of the image */
  title: LocalizedString;
  /** Supporting text / tagline shown under the headline */
  subtitle: LocalizedString;
  /** CTA label shown in the banner button */
  ctaLabel: LocalizedString;
  /** Desktop image URL */
  imageUrl: string;
  /** Optional phone-specific image URL; storefront falls back to imageUrl */
  mobileImageUrl?: string;
  /** Link URL set by Admin */
  linkUrl: string;
  /** Link target: '_blank' opens new tab, '_self' same tab (default) */
  linkTarget?: "_blank" | "_self";
  /** Display order — lower number = shown first */
  sortOrder: number;
  /** Enable / disable display without deleting */
  isActive: boolean;
}
