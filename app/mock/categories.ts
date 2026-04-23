import type { MainCategory, SubCategory } from "~/types/category";

/**
 * Main categories — hardcoded, changed only by developers.
 */
export const mainCategories: MainCategory[] = [
  {
    key: "safety_equipment",
    labelKey: "categories.main.safetyEquipment",
    icon: "bx:shield-quarter",
  },
  {
    key: "mechanic_tools",
    labelKey: "categories.main.mechanicTools",
    icon: "bx:wrench",
  },
  {
    key: "measuring_tools",
    labelKey: "categories.main.measuringTools",
    icon: "bx:ruler",
  },
  {
    key: "ppe_general",
    labelKey: "categories.main.ppeGeneral",
    icon: "bx:hard-hat",
  },
  {
    key: "construction_consumables",
    labelKey: "categories.main.constructionConsumables",
    icon: "bx:building-house",
  },
  {
    key: "screws_bolts",
    labelKey: "categories.main.screwsBolts",
    icon: "bx:cog",
  },
  {
    key: "others",
    labelKey: "categories.main.others",
    icon: "bx:dots-horizontal-rounded",
  },
];

/**
 * Mock sub-categories — will be replaced by database data in the future.
 */
export const mockSubCategories: SubCategory[] = [
  // ── safety_equipment ──
  {
    id: "s01",
    mainCategoryKey: "safety_equipment",
    labelKey: "categories.sub.highWork",
  },
  {
    id: "s02",
    mainCategoryKey: "safety_equipment",
    labelKey: "categories.sub.sparkRisk",
  },
  {
    id: "s03",
    mainCategoryKey: "safety_equipment",
    labelKey: "categories.sub.moving",
  },
  {
    id: "s04",
    mainCategoryKey: "safety_equipment",
    labelKey: "categories.sub.crane",
  },
  {
    id: "s05",
    mainCategoryKey: "safety_equipment",
    labelKey: "categories.sub.constructionGeneral",
  },
  {
    id: "s06",
    mainCategoryKey: "safety_equipment",
    labelKey: "categories.sub.confinedSpace",
  },

  // ── mechanic_tools ──
  {
    id: "m01",
    mainCategoryKey: "mechanic_tools",
    labelKey: "categories.sub.batteryTools",
  },
  {
    id: "m02",
    mainCategoryKey: "mechanic_tools",
    labelKey: "categories.sub.specialTools",
  },
  {
    id: "m03",
    mainCategoryKey: "mechanic_tools",
    labelKey: "categories.sub.tighteningWork",
  },
  {
    id: "m04",
    mainCategoryKey: "mechanic_tools",
    labelKey: "categories.sub.measuringInstruments",
  },
  {
    id: "m05",
    mainCategoryKey: "mechanic_tools",
    labelKey: "categories.sub.masonryWork",
  },
  {
    id: "m06",
    mainCategoryKey: "mechanic_tools",
    labelKey: "categories.sub.cuttingTools",
  },

  // ── measuring_tools ──
  {
    id: "me01",
    mainCategoryKey: "measuring_tools",
    labelKey: "categories.sub.tapeMeasure",
  },
  {
    id: "me02",
    mainCategoryKey: "measuring_tools",
    labelKey: "categories.sub.laserLevel",
  },
  {
    id: "me03",
    mainCategoryKey: "measuring_tools",
    labelKey: "categories.sub.caliper",
  },
  {
    id: "me04",
    mainCategoryKey: "measuring_tools",
    labelKey: "categories.sub.multimeter",
  },
  {
    id: "me05",
    mainCategoryKey: "measuring_tools",
    labelKey: "categories.sub.thermometer",
  },

  // ── ppe_general ──
  {
    id: "p01",
    mainCategoryKey: "ppe_general",
    labelKey: "categories.sub.helmet",
  },
  {
    id: "p02",
    mainCategoryKey: "ppe_general",
    labelKey: "categories.sub.safetyGlasses",
  },
  {
    id: "p03",
    mainCategoryKey: "ppe_general",
    labelKey: "categories.sub.gloves",
  },
  {
    id: "p04",
    mainCategoryKey: "ppe_general",
    labelKey: "categories.sub.safetyShoes",
  },
  {
    id: "p05",
    mainCategoryKey: "ppe_general",
    labelKey: "categories.sub.earPlugs",
  },
  {
    id: "p06",
    mainCategoryKey: "ppe_general",
    labelKey: "categories.sub.dustMask",
  },

  // ── construction_consumables ──
  {
    id: "cc01",
    mainCategoryKey: "construction_consumables",
    labelKey: "categories.sub.cement",
  },
  {
    id: "cc02",
    mainCategoryKey: "construction_consumables",
    labelKey: "categories.sub.sand",
  },
  {
    id: "cc03",
    mainCategoryKey: "construction_consumables",
    labelKey: "categories.sub.wire",
  },
  {
    id: "cc04",
    mainCategoryKey: "construction_consumables",
    labelKey: "categories.sub.nails",
  },
  {
    id: "cc05",
    mainCategoryKey: "construction_consumables",
    labelKey: "categories.sub.sealant",
  },

  // ── screws_bolts ──
  {
    id: "sb01",
    mainCategoryKey: "screws_bolts",
    labelKey: "categories.sub.screws",
  },
  {
    id: "sb02",
    mainCategoryKey: "screws_bolts",
    labelKey: "categories.sub.bolts",
  },
  {
    id: "sb03",
    mainCategoryKey: "screws_bolts",
    labelKey: "categories.sub.washers",
  },
  {
    id: "sb04",
    mainCategoryKey: "screws_bolts",
    labelKey: "categories.sub.nuts",
  },
  {
    id: "sb05",
    mainCategoryKey: "screws_bolts",
    labelKey: "categories.sub.anchors",
  },

  // ── others ──
  {
    id: "o01",
    mainCategoryKey: "others",
    labelKey: "categories.sub.cleaningSupplies",
  },
  {
    id: "o02",
    mainCategoryKey: "others",
    labelKey: "categories.sub.lubricants",
  },
  { id: "o03", mainCategoryKey: "others", labelKey: "categories.sub.tapes" },
  { id: "o04", mainCategoryKey: "others", labelKey: "categories.sub.ropes" },
  {
    id: "o05",
    mainCategoryKey: "others",
    labelKey: "categories.sub.miscellaneous",
  },
];
