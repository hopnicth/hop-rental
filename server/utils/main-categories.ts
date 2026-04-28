import {
  asMainCategoryEntityTypes,
  type MainCategoryEntityType,
} from "~~/server/utils/admin-main-categories";

export const PUBLIC_MAIN_CATEGORY_SELECT =
  "key, label_th, label_en, icon, entity_types, is_active, sort_order";

export function mapPublicMainCategory(row: Record<string, unknown>) {
  return {
    key: String(row.key ?? ""),
    labelTh: String(row.label_th ?? ""),
    labelEn: String(row.label_en ?? ""),
    icon: typeof row.icon === "string" ? row.icon : "",
    entityTypes: asMainCategoryEntityTypes(row.entity_types),
    isActive: row.is_active !== false,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

export type PublicMainCategory = ReturnType<typeof mapPublicMainCategory>;
export type PublicMainCategoryEntityType = MainCategoryEntityType;
