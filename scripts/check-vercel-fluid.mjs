#!/usr/bin/env node
/**
 * scripts/check-vercel-fluid.mjs
 *
 * Manual production-enablement gate: verifies Vercel Fluid Compute is ENABLED
 * for the HOPNIC project. The KYC pure-proxy document download (decisions.md
 * 2026-06-05 Decision D impact 2; docs/kyc-phase-2-download-spec.md §8) is
 * contingent on `resourceConfig.fluid === true` — if this check does not PASS,
 * production KYC proxy download must NOT be enabled and the streaming spike
 * must be re-run before any further production use.
 *
 * Source of truth: the Vercel REST API ONLY —
 *   GET https://api.vercel.com/v9/projects/{VERCEL_PROJECT_ID}[?teamId={VERCEL_TEAM_ID}]
 * Fluid Compute is a project-level setting; it does NOT appear in build output
 * (`.vc-config.json`), so no build artifact can prove it.
 *
 * Usage (live — EPHEMERAL token; create → run → revoke, never store):
 *   VERCEL_TOKEN=… VERCEL_PROJECT_ID=prj_… [VERCEL_TEAM_ID=team_…] \
 *     node scripts/check-vercel-fluid.mjs
 *
 * Usage (offline dry-run — no credentials; runs a canned {status, body,
 * expectedProjectId} JSON file through the same evaluator):
 *   node scripts/check-vercel-fluid.mjs --fixture path/to/fixture.json
 *
 * Exit codes:
 *   0  PASS    resourceConfig.fluid === true (strict boolean)
 *   1  FAIL    resourceConfig.fluid === false — Fluid Compute is DISABLED
 *   2  UNKNOWN cannot verify (auth/API error, project id mismatch, missing or
 *              non-boolean flag, unexpected response shape) — treated as a
 *              hard stop, never as a pass
 *
 * Security: the token is read from process.env only and is never printed or
 * interpolated into any output. No standing CI secret — manual gate only.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// ── Verdicts ─────────────────────────────────────────────────────────────────

export const VERDICTS = Object.freeze({
  PASS: "pass",
  FLUID_DISABLED: "fluid_disabled",
  UNKNOWN: "unknown",
});

export const VERDICT_EXIT_CODES = Object.freeze({
  [VERDICTS.PASS]: 0,
  [VERDICTS.FLUID_DISABLED]: 1,
  [VERDICTS.UNKNOWN]: 2,
});

const STOP_NOTE =
  "Production KYC proxy download enablement must STOP — do not enable it until this check is PASS.";

const RESPIKE_NOTE =
  "If Fluid Compute is disabled or cannot be verified, the KYC proxy download streaming spike " +
  "must be RE-RUN before any further production use (decisions.md Decision D impact 2). " +
  "The shelved signed-URL contingency (docs/kyc-phase-2-download-spec.md §9) activates only with owner approval.";

// ── Pure evaluator (fixture-testable, no I/O) ────────────────────────────────

/**
 * Evaluates a Vercel `GET /v9/projects/{id}` response.
 *
 * @param {{ status: unknown, body: unknown, expectedProjectId: unknown }} input
 * @returns {{ verdict: string, message: string }}
 */
export function evaluateFluidGuard({ status, body, expectedProjectId }) {
  const unknown = (detail) => ({
    verdict: VERDICTS.UNKNOWN,
    message: [
      `UNKNOWN — cannot verify Fluid Compute: ${detail}`,
      "Do NOT assume Fluid Compute is enabled.",
      STOP_NOTE,
      RESPIKE_NOTE,
    ].join("\n"),
  });

  if (typeof expectedProjectId !== "string" || expectedProjectId.length === 0) {
    return unknown("no expected project id provided (VERCEL_PROJECT_ID is required)");
  }
  if (status !== 200) {
    return unknown(
      `Vercel API returned HTTP ${String(status)} (auth error, wrong/missing teamId scope, or wrong project id)`,
    );
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return unknown("response body is not a JSON object (unexpected response shape)");
  }
  if (body.id !== expectedProjectId) {
    return unknown(
      `response project id "${String(body.id)}" does not match expected "${expectedProjectId}"`,
    );
  }

  const resourceConfig = body.resourceConfig;
  if (
    resourceConfig === null ||
    typeof resourceConfig !== "object" ||
    Array.isArray(resourceConfig)
  ) {
    return unknown("resourceConfig is missing from the response (API shape changed? update this guard)");
  }
  if (!("fluid" in resourceConfig)) {
    return unknown("resourceConfig.fluid is missing (API shape changed? update this guard)");
  }

  const fluid = resourceConfig.fluid;
  if (typeof fluid !== "boolean") {
    return unknown(
      `resourceConfig.fluid has type ${typeof fluid} (value ${JSON.stringify(fluid)}) — ` +
        'strict boolean required; string "true" is NOT accepted',
    );
  }

  if (fluid === false) {
    return {
      verdict: VERDICTS.FLUID_DISABLED,
      message: [
        "FAIL — Fluid Compute is DISABLED for this project (resourceConfig.fluid === false).",
        STOP_NOTE,
        RESPIKE_NOTE,
      ].join("\n"),
    };
  }

  return {
    verdict: VERDICTS.PASS,
    message: [
      "PASS — resourceConfig.fluid === true (Fluid Compute is enabled).",
      "The Decision D Fluid Compute gate is satisfied for this run.",
      "Note: this satisfies ONLY the Fluid gate — Decision C's five production gates still apply.",
    ].join("\n"),
  };
}

// ── CLI shell ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const flagIndex = argv.indexOf("--fixture");
  if (flagIndex === -1) return { mode: "live" };
  return { mode: "fixture", fixturePath: argv[flagIndex + 1] };
}

async function fetchLiveProject({ token, projectId, teamId }) {
  const url = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}`);
  if (teamId) url.searchParams.set("teamId", teamId);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let body;
  try {
    body = await response.json();
  } catch {
    body = undefined; // non-JSON body → evaluator returns UNKNOWN
  }
  return { status: response.status, body };
}

function report(result, contextLines) {
  console.log("━━━ HOPNIC Vercel Fluid Compute Guard ━━━━━━━━━━━━━━━━━━");
  for (const line of contextLines) console.log(line);
  console.log("────────────────────────────────────────────────────────");
  console.log(result.message);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  process.exit(VERDICT_EXIT_CODES[result.verdict]);
}

async function main() {
  const { mode, fixturePath } = parseArgs(process.argv.slice(2));

  if (mode === "fixture") {
    if (!fixturePath) {
      report(
        { verdict: VERDICTS.UNKNOWN, message: "UNKNOWN — --fixture requires a path to a JSON file." },
        ["Mode    : fixture dry-run"],
      );
      return;
    }
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    const result = evaluateFluidGuard({
      status: fixture.status,
      body: fixture.body,
      expectedProjectId: fixture.expectedProjectId ?? process.env.VERCEL_PROJECT_ID ?? "",
    });
    report(result, [`Mode    : fixture dry-run (${fixturePath}) — no Vercel API call`]);
    return;
  }

  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;

  const context = [
    "Mode    : live Vercel API",
    `Project : ${projectId ?? "(VERCEL_PROJECT_ID not set)"}`,
    `Team    : ${teamId ?? "(no VERCEL_TEAM_ID — personal scope)"}`,
  ];

  if (!token || !projectId) {
    report(
      {
        verdict: VERDICTS.UNKNOWN,
        message: [
          "UNKNOWN — missing required environment: VERCEL_TOKEN and VERCEL_PROJECT_ID must be set.",
          "Use an EPHEMERAL token (create → run → revoke). Never store it in the repo or CI.",
          STOP_NOTE,
          RESPIKE_NOTE,
        ].join("\n"),
      },
      context,
    );
    return;
  }

  let response;
  try {
    response = await fetchLiveProject({ token, projectId, teamId });
  } catch (err) {
    report(
      {
        verdict: VERDICTS.UNKNOWN,
        message: [
          `UNKNOWN — Vercel API request failed: ${err instanceof Error ? err.message : String(err)}`,
          "Do NOT assume Fluid Compute is enabled.",
          STOP_NOTE,
          RESPIKE_NOTE,
        ].join("\n"),
      },
      context,
    );
    return;
  }

  const result = evaluateFluidGuard({
    status: response.status,
    body: response.body,
    expectedProjectId: projectId,
  });
  report(result, context);
}

// Run only when executed directly — never on import (tests import the evaluator).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`UNKNOWN — unexpected failure: ${err instanceof Error ? err.message : String(err)}`);
    console.error(STOP_NOTE);
    console.error(RESPIKE_NOTE);
    process.exit(VERDICT_EXIT_CODES[VERDICTS.UNKNOWN]);
  });
}
