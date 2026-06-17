/**
 * Guard: app pages must not reference a route middleware that doesn't exist.
 *
 * The repo registers only `app/middleware/role.ts` (named `role`). There is no
 * `auth` route middleware — auth is enforced globally by @nuxtjs/supabase
 * `redirectOptions`. A page declaring `middleware: 'auth'` throws at navigation
 * ("Unknown route middleware: 'auth'"). This guard fails fast if reintroduced.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function walkVue(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) walkVue(full, out);
    else if (entry.endsWith(".vue")) out.push(full);
  }
  return out;
}

describe("route middleware guard", () => {
  it("registers a `role` route middleware (and that is the only one assumed)", () => {
    expect(existsSync(resolve(process.cwd(), "app/middleware/role.ts"))).toBe(
      true,
    );
  });

  it("no app page declares the non-existent `auth` route middleware", () => {
    const pages = walkVue(resolve(process.cwd(), "app/pages"));
    const offenders = pages.filter((f) => {
      const src = readFileSync(f, "utf8");
      return /middleware:\s*(\[\s*)?['"]auth['"]/.test(src);
    });
    expect(offenders).toEqual([]);
  });
});
