/**
 * Static level-0 partner taxonomy config for the public /partners category rail
 * (B-4). Order matches the taxonomy `sort_order` seeded in migration 116.
 *
 * SYNC NOTE: the DB column `partner_categories.icon` (migration 116 seed) currently
 * holds these SAME icon values. This file is the single client-side source of truth
 * for the rail (no runtime fetch); the DB column is authoritative for server-side /
 * admin use. If the icons or the level-0 category set ever change, update BOTH this
 * file AND the migration-116 seed so they stay in sync.
 *
 * Labels are NOT stored here — they resolve via the i18n key
 * `partners.categories.${slug}` (the same keys PartnerCard uses).
 */
export interface PartnerLevel0Category {
  /** Matches `partner_categories.slug` for a level-0 (top-level) category. */
  slug: string;
  /** Iconify name, resolved at runtime via @nuxt/icon like the rest of the app. */
  icon: string;
}

export const PARTNER_LEVEL0_CATEGORIES: readonly PartnerLevel0Category[] = [
  { slug: "construction_materials", icon: "i-lucide-brick-wall" },
  { slug: "contractor_services", icon: "i-lucide-handshake" },
  { slug: "freelance_technicians", icon: "i-lucide-wrench" },
  { slug: "freelance_foremen", icon: "i-lucide-clipboard-check" },
  { slug: "freelance_engineers", icon: "i-lucide-ruler" },
  { slug: "freelance_safety_officers", icon: "i-lucide-shield-check" },
  { slug: "drafting_design", icon: "i-lucide-drafting-compass" },
  { slug: "plc_programmers", icon: "i-lucide-cpu" },
] as const;

/** Icon for a level-0 slug, or undefined if it is not a known level-0 category. */
export function partnerCategoryIcon(slug: string): string | undefined {
  return PARTNER_LEVEL0_CATEGORIES.find((c) => c.slug === slug)?.icon;
}
