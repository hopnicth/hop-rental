/**
 * Shared i18n types for multi-language content stored in database.
 *
 * These types are used by entities whose content is managed by Admin
 * (e.g. Product, Supplier) — NOT for static UI labels which use
 * i18n JSON files (th.json, en.json, cn.json, jp.json).
 *
 * Locale codes must match nuxt.config.ts → i18n.locales[].code
 */

/** Supported locale codes — synced with nuxt.config.ts */
export type LocaleCode = 'th' | 'en' | 'cn' | 'jp';

/**
 * A string that has a value for each supported locale.
 *
 * Usage:
 * ```ts
 * const name: LocalizedString = {
 *   th: 'สว่านไฟฟ้า Bosch',
 *   en: 'Bosch Electric Drill',
 *   cn: '博世电钻',
 *   jp: 'ボッシュ電動ドリル',
 * };
 * ```
 *
 * In Vue template:
 * ```vue
 * <template>
 *   <h3>{{ product.name[locale] }}</h3>
 * </template>
 * ```
 */
export type LocalizedString = Record<LocaleCode, string>;

