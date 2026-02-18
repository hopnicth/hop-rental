/**
 * Banner slide data structure
 *
 * In the future, this data will come from the database
 * (Admin uploads images via dashboard).
 * For now, we use mock data with this production-ready structure.
 */
export interface BannerSlide {
  /** Unique identifier (from DB in future) */
  id: string;
  /** URL of the banner image */
  imageUrl: string;
  /** Alt text for accessibility / SEO */
  alt: string;
  /** Link URL set by Admin (promo page, blog post, etc.) */
  linkUrl: string;
  /** Link target: '_blank' opens new tab, '_self' same tab (default) */
  linkTarget?: '_blank' | '_self';
  /** Display order — lower number = shown first */
  sortOrder: number;
  /** Enable / disable display without deleting */
  isActive: boolean;
}

