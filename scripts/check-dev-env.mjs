#!/usr/bin/env node
/**
 * Dev environment guard — FAIL-CLOSED (BACKLOG [INFRA], retired by this script).
 *
 * The hazard this exists for: `.env` used to hold the REMOTE project and Nuxt
 * loads `.env` by default, so a bare `npm run dev` pointed the app at
 * PRODUCTION. Mutating local work — settling a booking, confirming a payment,
 * a smoke walk — then wrote real rows. It nearly happened three times
 * (2026-07-09, 2026-07-10, and again during the mig-146 walk on 2026-07-26).
 *
 * The rule now: the DEFAULT is local, and remote is an explicit, named opt-in.
 *   npm run dev          -> .env.local, refuses to start unless it is local
 *   npm run dev:remote   -> .env.remote, refuses unless --allow-remote is passed
 *
 * This guard runs BEFORE the dev server (predev) and also checks for a stray
 * `.env`, because tools that bypass our npm scripts (`npx nuxt dev`, `nuxt
 * build`) still read it. A remote `.env` is therefore treated as a setup error
 * with a named fix, not a warning.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const allowRemote = process.argv.includes("--allow-remote");
const LOCAL_HOST_RE = /(127\.0\.0\.1|localhost|\[::1\])/;

function readSupabaseUrl(file) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return null;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\s*SUPABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (match) return match[1].replace(/^["']|["']$/g, "");
  }
  return null;
}

function isLocal(url) {
  return typeof url === "string" && LOCAL_HOST_RE.test(url);
}

/** Never print the URL itself — the project ref is not ours to leak into logs. */
function describe(url) {
  if (!url) return "not set";
  return isLocal(url) ? "local" : "REMOTE";
}

const problems = [];

if (allowRemote) {
  const remoteUrl = readSupabaseUrl(".env.remote");
  if (!remoteUrl) {
    problems.push(
      "`.env.remote` is missing or has no SUPABASE_URL — create it with the remote project's values (it is gitignored).",
    );
  } else if (isLocal(remoteUrl)) {
    problems.push(
      "`.env.remote` points at a LOCAL Supabase — that is almost certainly a mistake; use `npm run dev` for local work.",
    );
  } else {
    console.warn(
      "\n  ⚠  DEV AGAINST THE REMOTE PROJECT. Writes here are REAL.\n" +
        "     Every mutating action — settlement, payment, cancellation — hits production data.\n",
    );
  }
} else {
  const localUrl = readSupabaseUrl(".env.local");
  if (!localUrl) {
    problems.push(
      "`.env.local` is missing or has no SUPABASE_URL — copy `.env.example` and fill it with the LOCAL stack's values (`supabase status`).",
    );
  } else if (!isLocal(localUrl)) {
    problems.push(
      `\`.env.local\` SUPABASE_URL resolves ${describe(localUrl)} — the default dev target must be local. Move remote values to \`.env.remote\` and use \`npm run dev:remote\`.`,
    );
  }
}

// A stray remote `.env` is a hazard even when this run is fine: anything that
// bypasses the npm scripts still loads it.
const strayUrl = readSupabaseUrl(".env");
if (strayUrl && !isLocal(strayUrl)) {
  problems.push(
    "`.env` holds a REMOTE SUPABASE_URL. Nuxt loads `.env` by default, so `npx nuxt dev` / `nuxt build` would silently target production.\n" +
      "     FIX: `mv .env .env.remote` (both are gitignored). Local values live in `.env.local`; remote work goes through `npm run dev:remote`.",
  );
}

if (problems.length > 0) {
  console.error("\n  ✖ dev environment refused to start:\n");
  for (const p of problems) console.error(`     - ${p}`);
  console.error("");
  process.exit(1);
}

console.log(
  `  ✓ dev env: ${allowRemote ? "REMOTE (explicit opt-in)" : "local"}`,
);
