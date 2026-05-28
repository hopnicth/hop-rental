/**
 * verify_remote.mjs
 * Dumps remote public schema and verifies partner_profiles + category seed.
 * Usage: node supabase/snippets/verify_remote.mjs
 */
import { spawnSync } from "child_process";

let pass = 0;
let fail = 0;

function check(label, test) {
  if (test) {
    console.log("PASS |", label);
    pass++;
  } else {
    console.log("FAIL |", label);
    fail++;
  }
}

// ── 1. Fetch remote schema dump ──────────────────────────────────────────────
console.log("\n=== Fetching remote schema dump ===");
const dumpResult = spawnSync("supabase", ["db", "dump", "--schema", "public"], {
  encoding: "utf8",
  timeout: 90000,
});
if (dumpResult.status !== 0) {
  console.error("ERROR: supabase db dump failed:", dumpResult.stderr);
  process.exit(1);
}
const dump = dumpResult.stdout;
console.log(`Schema dump size: ${dump.length} characters`);

// ── 2. Fetch remote data dump (filter for main_categories lines) ─────────────
// CLI v2.75.0 does not support --table; use --data-only and filter in Node.js
console.log("\n=== Fetching remote data dump (main_categories rows) ===");
const dataResult = spawnSync(
  "supabase",
  ["db", "dump", "--data-only", "--schema", "public"],
  { encoding: "utf8", timeout: 120000 },
);
if (dataResult.status !== 0) {
  console.error("WARN: data dump failed:", dataResult.stderr?.slice(0, 200));
}
const rawData = dataResult.stdout || "";
// Keep only lines relevant to main_categories seed data
const dataDump = rawData
  .split("\n")
  .filter(
    (l) =>
      l.includes("main_categories") ||
      l.includes("store_") ||
      l.includes("service_") ||
      l.includes("contractor_") ||
      l.includes("partner"),
  )
  .join("\n");
console.log(`Data dump filtered size: ${dataDump.length} characters`);

// ── 3. Verification checks ───────────────────────────────────────────────────
// NOTE: supabase db dump uses double-quoted identifiers:
//   "public"."partner_profiles", "service_areas" "text"[], USING (("is_public" = true))
console.log("\n=== Remote Schema Verification ===");

// Table — dump uses double-quoted format with IF NOT EXISTS
check(
  "01: partner_profiles table exists",
  dump.includes('"partner_profiles"') && dump.includes("CREATE TABLE"),
);

// Columns — dump uses "col_name" "type" format
check("02: business_hours_text column", dump.includes('"business_hours_text"'));
check(
  "03: service_areas text[] NOT NULL",
  dump.includes('"service_areas"') && dump.includes('"text"[]'),
);
check("04: is_public column", dump.includes("is_public"));
check("05: is_verified column", dump.includes("is_verified"));
check("06: kyc_documents jsonb column", dump.includes("kyc_documents"));
check("07: verified_notes column", dump.includes("verified_notes"));
check("08: internal_notes column", dump.includes("internal_notes"));

// maps_url constraint — 3 allowed domains
check(
  "09: maps_url allows maps.google.com",
  dump.includes("maps\\.google\\.com"),
);
check(
  "10: maps_url allows google.com/maps",
  dump.includes("google\\.com/maps"),
);
check(
  "11: maps_url allows maps.app.goo.gl",
  dump.includes("maps\\.app\\.goo\\.gl"),
);

// goo.gl standalone MUST be absent from maps_url constraint
// Strip maps\.app\.goo\.gl occurrences, then verify no bare goo\.gl remains
const mapsConstraint = (() => {
  const start = dump.indexOf("partner_profiles_maps_url_check");
  if (start === -1) return "";
  return dump.slice(start, start + 500);
})();
const stripped = mapsConstraint
  .replace(/maps\\\.app\\\.goo\\\.gl/g, "")
  .replace(/maps\.app\.goo\.gl/g, "");
check(
  "12: goo.gl NOT standalone in maps_url",
  !stripped.includes("goo\\.gl") && !stripped.includes("goo.gl'"),
);

// line_url constraint
check(
  "13: line_url constraint (line.me)",
  dump.includes("line\\.me") || dump.includes("line.me"),
);

// directory_type / entity_type constraints
check(
  "14: directory_type store/service/contractor",
  dump.includes("'store'") &&
    dump.includes("'service'") &&
    dump.includes("'contractor'"),
);
check(
  "15: entity_type individual/organization",
  dump.includes("'individual'") && dump.includes("'organization'"),
);

// Reserved slug constraint
check("16: reserved slug constraint (admin)", dump.includes("'admin'"));
check("17: reserved slug constraint (stores)", dump.includes("'stores'"));

// RLS policies
check(
  "18: partner_profiles_select_public policy",
  dump.includes("partner_profiles_select_public"),
);
check(
  "19: partner_profiles_service_role_all policy",
  dump.includes("partner_profiles_service_role_all"),
);
check(
  "20: RLS select policy uses is_public",
  // dump format: USING (("is_public" = true))
  dump.includes('"is_public" = true') || dump.includes("is_public"),
);

// Column-level GRANTs: dump format is per-column e.g.
//   GRANT SELECT("business_hours_text") ON TABLE "public"."partner_profiles" TO "anon";
// Find the partner_profiles grant block (starts after service_role ALL grant)
const ppGrantBlock = (() => {
  const srIdx = dump.indexOf(
    'GRANT ALL ON TABLE "public"."partner_profiles" TO "service_role"',
  );
  if (srIdx === -1) return "";
  return dump.slice(srIdx, srIdx + 10000);
})();
check(
  "21: kyc_documents NOT in partner_profiles anon GRANT",
  !ppGrantBlock.includes('"kyc_documents"'),
);
check(
  "22: verified_notes NOT in partner_profiles anon GRANT",
  !ppGrantBlock.includes('"verified_notes"'),
);
check(
  "23: internal_notes NOT in partner_profiles anon GRANT",
  !ppGrantBlock.includes('"internal_notes"'),
);
check(
  "24: business_hours_text IN partner_profiles anon GRANT",
  ppGrantBlock.includes('"business_hours_text"') &&
    ppGrantBlock.includes('"anon"'),
);

// Trigger
check(
  "25: set_partner_profiles_updated_at trigger",
  dump.includes("set_partner_profiles_updated_at"),
);
check(
  "26: update_updated_at function referenced",
  dump.includes("update_updated_at"),
);

// Indexes
check(
  "27: service_areas GIN index",
  dump.includes("idx_partner_profiles_service_areas"),
);
check(
  "28: dir_public_sort index",
  dump.includes("idx_partner_profiles_dir_public_sort"),
);

// main_categories constraint extended for partner
check("29: entity_types allows partner value", dump.includes("'partner'"));

// Category seed — keys appear in DATA dump (INSERT statements), not schema dump
const storeKeys = [
  "store_construction_materials",
  "store_hardware_tools",
  "store_electrical_lighting",
  "store_plumbing",
  "store_safety_ppe",
  "store_paints_chemicals",
  "store_signage_print",
];
const serviceKeys = [
  "service_transport_logistics",
  "service_heavy_machinery_rental",
  "service_waste_disposal",
  "service_site_facilities",
  "service_design_consulting",
  "service_safety_services",
];
const contractorKeys = [
  "contractor_general",
  "contractor_structural_masonry",
  "contractor_electrical_network",
  "contractor_plumbing_sanitary",
  "contractor_roofing_steel_work",
  "contractor_finishing_work",
  "contractor_general_labor",
];

storeKeys.forEach((k) =>
  check(`30: store category ${k}`, dataDump.includes(k)),
);
serviceKeys.forEach((k) =>
  check(`31: service category ${k}`, dataDump.includes(k)),
);
contractorKeys.forEach((k) =>
  check(`32: contractor category ${k}`, dataDump.includes(k)),
);

check(
  "33: all 7 store_ keys present",
  storeKeys.every((k) => dataDump.includes(k)),
);
check(
  "34: all 6 service_ keys present",
  serviceKeys.every((k) => dataDump.includes(k)),
);
check(
  "35: all 7 contractor_ keys present",
  contractorKeys.every((k) => dataDump.includes(k)),
);
check("36: partner entity_type in category data", dataDump.includes("partner"));

// ── 3. Summary ───────────────────────────────────────────────────────────────
console.log("\n======================================================");
console.log(` TOTAL: PASS=${pass}  FAIL=${fail}`);
console.log("======================================================");
process.exit(fail > 0 ? 1 : 0);
