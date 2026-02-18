/**
 * Icon Slide item data structure
 *
 * Used by the generic IconSlide component to render
 * a horizontal marquee of logos / icons.
 *
 * In the future, data will come from the database (partner IDs → image + link).
 * For now, we use mock data with this production-ready structure.
 */
export interface IconSlideItem {
  /** Unique identifier (from DB in future) */
  id: string;
  /** URL of the logo / icon image */
  imageUrl: string;
  /** Alt text for accessibility / SEO */
  alt: string;
  /** Optional link URL — if provided, the icon becomes clickable */
  linkUrl?: string;
  /** Link target: '_blank' opens new tab, '_self' same tab (default) */
  linkTarget?: '_blank' | '_self';
}

