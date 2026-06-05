/**
 * Tests: Vercel Fluid Compute guard script (scripts/check-vercel-fluid.mjs)
 *
 * Covers:
 *  1. evaluateFluidGuard three-state verdicts (pass / fluid_disabled / unknown)
 *     — fixture-based only, NO real Vercel API calls anywhere in this file
 *  2. Strict-boolean handling — string "true" / truthy non-booleans are never
 *     accepted as PASS
 *  3. Project-id mismatch, auth/API errors, and unexpected response shapes
 *     → unknown (fail-loud, never a silent pass)
 *  4. Non-pass messages always carry the production-stop + re-spike guidance
 *     (decisions.md Decision D impact 2)
 *  5. Exit-code mapping (pass 0, fluid_disabled 1, unknown 2)
 *  6. Source inspection: the token is never printed/interpolated into output;
 *     its only interpolation is the Authorization header
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  evaluateFluidGuard,
  VERDICTS,
  VERDICT_EXIT_CODES,
} from "../../scripts/check-vercel-fluid.mjs";

const PROJECT_ID = "prj_test_hop_rental_123";

function vercelProject(overrides: Record<string, unknown> = {}) {
  return {
    id: PROJECT_ID,
    name: "hop-rental",
    resourceConfig: { fluid: true, functionDefaultRegions: ["iad1"] },
    ...overrides,
  };
}

function evaluate(overrides: Record<string, unknown> = {}) {
  return evaluateFluidGuard({
    status: 200,
    body: vercelProject(),
    expectedProjectId: PROJECT_ID,
    ...overrides,
  });
}

describe("evaluateFluidGuard — PASS", () => {
  it("passes only when resourceConfig.fluid === true (boolean) and project id matches", () => {
    const result = evaluate();
    expect(result.verdict).toBe(VERDICTS.PASS);
    expect(result.message).toContain("resourceConfig.fluid === true");
  });

  it("PASS message still points at Decision C's remaining production gates", () => {
    const result = evaluate();
    expect(result.message).toContain("Decision C");
  });
});

describe("evaluateFluidGuard — FAIL (fluid disabled)", () => {
  it("fluid === false → fluid_disabled", () => {
    const result = evaluate({ body: vercelProject({ resourceConfig: { fluid: false } }) });
    expect(result.verdict).toBe(VERDICTS.FLUID_DISABLED);
    expect(result.message).toContain("Fluid Compute is DISABLED");
  });

  it("fluid_disabled message orders production stop and re-spike", () => {
    const result = evaluate({ body: vercelProject({ resourceConfig: { fluid: false } }) });
    expect(result.message).toContain("must STOP");
    expect(result.message).toContain("RE-RUN");
    expect(result.message).toContain("Decision D");
  });
});

describe("evaluateFluidGuard — UNKNOWN (fail-loud, never silent pass)", () => {
  const unknownCases: Array<[string, Record<string, unknown>]> = [
    ["missing resourceConfig", { body: { id: PROJECT_ID, name: "hop-rental" } }],
    ["resourceConfig is null", { body: vercelProject({ resourceConfig: null }) }],
    ["resourceConfig is an array", { body: vercelProject({ resourceConfig: [] }) }],
    ["missing fluid key", { body: vercelProject({ resourceConfig: {} }) }],
    ['fluid as string "true"', { body: vercelProject({ resourceConfig: { fluid: "true" } }) }],
    ["fluid as number 1", { body: vercelProject({ resourceConfig: { fluid: 1 } }) }],
    ["fluid as null", { body: vercelProject({ resourceConfig: { fluid: null } }) }],
    ["wrong project id in response", { body: vercelProject({ id: "prj_other_project" }) }],
    ["HTTP 401 (bad token)", { status: 401, body: { error: { code: "forbidden" } } }],
    ["HTTP 403 (wrong scope)", { status: 403, body: { error: { code: "forbidden" } } }],
    ["HTTP 404 (wrong team/project)", { status: 404, body: { error: { code: "not_found" } } }],
    ["HTTP 500", { status: 500, body: undefined }],
    ["non-object body", { body: "not json" }],
    ["null body", { body: null }],
    ["array body", { body: [vercelProject()] }],
    ["missing expectedProjectId", { expectedProjectId: "" }],
    ["non-string expectedProjectId", { expectedProjectId: undefined }],
  ];

  it.each(unknownCases)("%s → unknown", (_label, overrides) => {
    const result = evaluate(overrides);
    expect(result.verdict).toBe(VERDICTS.UNKNOWN);
  });

  it('string "true" rejection explains the strict-boolean rule', () => {
    const result = evaluate({ body: vercelProject({ resourceConfig: { fluid: "true" } }) });
    expect(result.message).toContain("strict boolean required");
    expect(result.message).toContain('string "true" is NOT accepted');
  });

  it("every unknown message carries do-not-assume + stop + re-spike guidance", () => {
    for (const [, overrides] of unknownCases) {
      const result = evaluate(overrides);
      expect(result.message).toContain("Do NOT assume Fluid Compute is enabled");
      expect(result.message).toContain("must STOP");
      expect(result.message).toContain("RE-RUN");
    }
  });
});

describe("exit-code mapping", () => {
  it("pass → 0, fluid_disabled → 1, unknown → 2", () => {
    expect(VERDICT_EXIT_CODES[VERDICTS.PASS]).toBe(0);
    expect(VERDICT_EXIT_CODES[VERDICTS.FLUID_DISABLED]).toBe(1);
    expect(VERDICT_EXIT_CODES[VERDICTS.UNKNOWN]).toBe(2);
  });

  it("every verdict has an exit code; only pass exits 0", () => {
    for (const verdict of Object.values(VERDICTS) as string[]) {
      expect(VERDICT_EXIT_CODES[verdict]).toBeTypeOf("number");
      if (verdict !== VERDICTS.PASS) {
        expect(VERDICT_EXIT_CODES[verdict]).not.toBe(0);
      }
    }
  });
});

describe("source inspection — token hygiene", () => {
  const src = readFileSync(
    resolve(process.cwd(), "scripts/check-vercel-fluid.mjs"),
    "utf8",
  );

  it("token comes from process.env only", () => {
    expect(src).toContain("process.env.VERCEL_TOKEN");
  });

  it("the token is interpolated exactly once — the Authorization header", () => {
    const interpolations = src.match(/\$\{token\}/g) ?? [];
    expect(interpolations).toHaveLength(1);
    expect(src).toContain("Authorization: `Bearer ${token}`");
  });

  it("no console output line interpolates the token", () => {
    const consoleLines = src.split("\n").filter((line) => line.includes("console."));
    for (const line of consoleLines) {
      expect(line).not.toContain("${token}");
    }
  });

  it("uses the Vercel API only — never reads build output as evidence", () => {
    expect(src).toContain("https://api.vercel.com/v9/projects/");
    // the only filesystem read is the --fixture dry-run path
    const reads = src.match(/readFileSync\(([^)]*)\)/g) ?? [];
    expect(reads).toHaveLength(1);
    expect(reads[0]).toContain("fixturePath");
  });
});
