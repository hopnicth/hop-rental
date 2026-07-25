# DESIGN-KIT-SCOPE — HOPNIC mockup-fidelity React kit (SCOPING ONLY)

> **STATUS: DEFERRED** (CHiP 2026-07-25) — not scheduled until **T5 (POS wiring) is complete**; revisit after T5. **Precondition RATIFIED: generate-don't-copy** (§5.1) is a hard requirement — the kit may not be built without it.

Status: **SCOPE / PROPOSAL — nothing built.** No package, no installs, no Claude Design project. This doc exists so the effort can be judged before any code.

Purpose: define the smallest React "mirror kit" that makes a mockup *look like HOPNIC*, extracted from the real Nuxt app's tokens and actual component usage. This kit is a **mockup artifact only** — see §4.

Provenance: values below are read from the live repo (paths cited). HOP-RENTAL is Nuxt 4 / Vue 3 + `@nuxt/ui ^4.4.0` (nuxt-ui v4, CSS-first config — there is **no** `tailwind.config.*`).

---

## 1. Token inventory (extracted, with sources)

### 1.1 The authoritative token file
`app/assets/css/main.css` (117 lines) is the single source of truth. It `@import "tailwindcss"` + `@import "@nuxt/ui"`, then overrides brand tokens on `:root`.

### 1.2 Colors — `app/assets/css/main.css:6-11`
| Token (CSS var) | Value | Note |
|---|---|---|
| `--ui-primary` | `#f1b323` | **amber/gold — the HOPNIC signature color** |
| `--ui-secondary` | `#815a32` | brown |
| `--ui-success` | `#8fb424` | yellow-green |
| `--ui-error` | `#ff3131` | red |
| `--ui-warning` | `#ff751f` | orange |
| gray scale | `"cool"` | `app/app.config.ts:4` — nuxt-ui **cool** neutral ramp (`--ui-color-neutral-*`) |

**⚠ Config conflict, resolved by CSS:** `app/app.config.ts:3` declares `primary: "green"`, but `main.css:6` overrides `--ui-primary: #f1b323`. The CSS var wins at runtime → **the real primary is gold `#f1b323`, not green.** The kit must mirror the CSS value; `app.config.ts`'s `green` is dead against the override.

Dark mode is deliberately identical to light (`main.css:23` `.dark { color-scheme: light; … }` remaps every `--ui-*` back to light values). → **The kit needs light mode only.**

### 1.3 Radius — `app/assets/css/main.css:13-21`
Every radius token is `0.2rem`: `--ui-radius`, `--radius-xs … --radius-4xl` all `0.2rem`. → **A flat, near-square radius is the second signature trait.** One value, no scale.

### 1.4 Typography — `app/assets/css/main.css:5`
`--font-sans: "Public Sans", sans-serif`. **Caveat:** `@nuxt/fonts` is NOT installed and no google-fonts module is configured — grep found only the family declaration, no loader. So in production Public Sans likely resolves only if present on the OS, else falls back to `sans-serif`. The kit should load Public Sans explicitly (e.g. Google Fonts `@import`) to look intentional — and this gap is worth a separate app-side ticket.

### 1.5 Spacing / shadows
**None defined in-repo** — spacing and shadows come entirely from Tailwind + nuxt-ui defaults; there are no HOPNIC overrides. → The kit inherits Tailwind's default spacing/shadow scale; nothing to mirror.

### 1.6 Layout constants (not design tokens, noted for completeness)
`--mobile-fab-clearance: 88px` (`main.css:12`); a bespoke `.payment-overlay` + `.payment-loader` animation (`main.css:45-117`). App-specific, out of kit scope.

---

## 2. Component inventory (actual usage in `app/**/*.vue`)

34 distinct `@nuxt/ui` primitives, **2,496 total usages**. Ranked:

| Component | Usages | | Component | Usages |
|---|--:|---|---|--:|
| UButton | 594 | | USelect | 28 |
| UFormField | 388 | | UModal | 19 |
| UInput | 280 | | UDivider | 10 |
| UCard | 258 | | UTooltip | 9 |
| UBadge | 254 | | USwitch / UFileUpload | 8 / 8 |
| UAlert | 205 | | UProgress | 6 |
| UIcon | 162 | | UDropdownMenu | 4 |
| UTextarea | 62 | | UTabs / UChip | 3 / 3 |
| USelectMenu | 60 | | USeparator / UPagination / UMain / UDrawer / UCarousel | 2 each |
| USkeleton | 49 | | UNavigationMenu / ULink / UHeader | 1 each |
| UCheckbox | 38 | | | |
| UContainer | 31 | | **UTable** | **0** |

**Notable:** `UTable: 0` — HOPNIC has **no data-table primitive**. The 2 admin files with a table hand-roll raw `<table>`. The task named tables as a candidate; the data says they're not worth mirroring.

**Custom components:** `app/components/` holds **112** `.vue` files across ~19 groups (admin, products, home, payment, partners, …). Spot-check shows these are **compositions**, not new primitives — e.g. `products/ProductCard.vue`, `products/AssetCard.vue` compose `UCard`; `payment/PaymentRequestStatusBadge.vue` wraps `UBadge`. There is **no raw-vs-wrapper primitive layer** to mirror; the design language lives in the ~7 heavily-used `U*` primitives + the tokens, and everything else is app assembly on top.

---

## 3. Proposed minimal React mirror kit (ruthless)

The mockup "looks like HOPNIC" from **tokens first** (gold primary + flat 0.2rem radius + Public Sans + cool neutrals) — that alone carries ~70% of the recognition. Then a **6-primitive** surface covers essentially every visible element:

### MIRROR (7 tokens + 6 primitives)
- **Tokens** (§1): the 5 brand colors, `cool` neutral ramp, radius `0.2rem`, Public Sans. Delivered as CSS vars + a tiny Tailwind preset so React className usage feels native.
- **Button** — 594 uses; the single most visible control. Mirror solid/outline/ghost + color variants (primary/neutral/error).
- **Badge** — 254; status pills are everywhere in HOPNIC (order/rental/payment states). Cheap, high recognition.
- **Card** — 258; the dominant container shape (flat radius shows here most).
- **Input** — 280; text field with the flat-radius, cool-border look.
- **FormField** — 388; label + control + error wrapper. High usage and it's what makes forms read as HOPNIC.
- **Alert** — 205; the standard notice block.

That's **the whole kit**: 6 components + a token layer. It renders buttons, forms, cards, badges, and notices — the entire visible vocabulary of a HOPNIC screen — at fidelity.

### DO NOT MIRROR (not worth the effort)
- **UTable (0 uses)** — nothing to mirror; a mockup table is a styled `<div>` grid if ever needed.
- **Icon** — don't reimplement `UIcon`; use `lucide-react`/heroicons in the mockup. Icon *set* fidelity isn't what makes it read as HOPNIC.
- **Select / SelectMenu / Modal / Drawer / Tabs / Dropdown / Tooltip / Pagination / Carousel / Progress / Switch / Checkbox / FileUpload / Skeleton** — interactive/stateful; a mockup shows a styled static box for the few that appear. Mirroring their behavior is real work for near-zero mockup gain. (Checkbox/Switch/Select can be trivial styled statics *if* a specific mockup needs them — author on demand, not upfront.)
- **Container / Main / Header / Divider / Separator / Link / NavigationMenu** — plain layout; div/nav/hr with token classes.

---

## 4. Effort + hard boundaries

**Effort estimate:** token layer (CSS vars + Tailwind preset) ≈ 1–2 h; 6 primitives in React + Tailwind, styled to match, with a small preview page ≈ 0.5–1 day. **Total: ~1 focused day** for a faithful minimal kit. (Contrast: mirroring the full 34-primitive surface with interactivity is multi-day and mostly wasted on mockups.)

**What this kit IS NOT — non-negotiable:**
1. **Never imported by the production Nuxt app.** It is React; the app is Vue. It lives in its own directory/repo, consumed only by mockup tooling (Claude Design or a standalone mockup app). Zero runtime coupling.
2. **Never a second source of truth for tokens.** `app/assets/css/main.css` remains the ONE authority. The kit's tokens are a *derived copy*, and must be treated as downstream (§5), never as a place to "adjust the brand."
3. **Not a component library for engineers to build features from.** It's fidelity scaffolding for mockups. Production UI stays `@nuxt/ui` in Vue.
4. **Not a design-system-of-record.** It intentionally omits 28 of 34 primitives; it is not "the HOPNIC design system," it's a mockup skin.

---

## 5. Risks + prevention

**Primary risk: token drift.** The app changes `--ui-primary` or the radius in `main.css`; the React kit keeps the old gold; mockups start lying about the brand. This is the one risk that matters, and it's guaranteed to happen if tokens are hand-copied.

**Prevention (in order of preference):**
1. **Generate, don't copy — RATIFIED HARD PRECONDITION (CHiP 2026-07-25).** A build script parses the `:root { --ui-* }` block out of `app/assets/css/main.css` and emits the kit's token file (CSS vars + Tailwind preset) **at build time**. The kit's tokens are then *always* derived — editing them by hand is impossible-by-workflow, and **hand-copied token values are PROHIBITED**. `main.css` stays the single authority (§4.2). The kit may not be built until this generator exists — it is not an optimization, it is the entry condition.
2. **Drift check in CI — REQUIRED before the kit is considered maintainable (CHiP 2026-07-25).** A test re-parses `main.css` and asserts the kit's emitted token values match; it fails loudly on divergence. (Requires the kit to see `main.css` — a read-only path or a copied-in snapshot with the check pinned to the source commit.) Without this check the kit is not maintainable and must not be treated as shippable, even with (1) in place.
3. **One-directional documentation.** The kit's token file header states "GENERATED FROM app/assets/css/main.css — do not edit; change the brand in the Nuxt app." Cheapest, weakest; use only alongside (1) and (2).

**Secondary risks:**
- **Config-vs-CSS confusion** (§1.2): anyone reading `app.config.ts` sees `green` and mis-mirrors. Prevention: the generator reads CSS vars, never `app.config.ts`; this doc records the resolution.
- **Font mismatch** (§1.4): the app declares Public Sans but loads no font; a kit that loads it will look *more* polished than the running app. Prevention: file the app-side "install @nuxt/fonts / load Public Sans" ticket so both converge upward, and note the discrepancy in the kit README.
- **Scope creep** (§3): pressure to add "just one more primitive" turns a 1-day mockup skin into a parallel DS. Prevention: the DO-NOT-MIRROR list is the contract; new primitives are authored per-mockup on demand, not added to the kit.

---

## Recommendation
Proceed only if mockups are a recurring need. If it's one-off, a token layer + Button/Card/Badge (≈2 h) already gets a mockup 80% of the way there; author the rest on demand. Do not build the kit until (5.1) generate-don't-copy is agreed — without it, drift is a certainty and the kit becomes a liability.
