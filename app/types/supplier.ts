import type { LocalizedString } from '~/types/locale';

/**
 * Supplier — ร้านค้า / ผู้จำหน่าย
 *
 * In the future, data will come from the database (Admin dashboard).
 * For now, we use mock data with this production-ready structure.
 *
 * Currently minimal (id + name) — will be expanded later
 * with fields like address, contact, logo, etc.
 */
export interface Supplier {
  /** Unique identifier (from DB in future) */
  id: string;
  /** Shop / supplier name — localized for 4 languages */
  name: LocalizedString;
}

