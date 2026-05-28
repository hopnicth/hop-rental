/**
 * Tests: OAuth confirm page — profile race condition fix
 *
 * Covers:
 *  1. confirm.vue waits for profile before redirecting (source inspection)
 *  2. confirm.vue uses clearProfile + refreshProfile + didRedirect guard
 *  3. useUserProfile exposes clearProfile and refreshProfile
 *  4. useAuthSession calls clearProfile() on logout
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const confirmPage = read("app/pages/user/confirm.vue");
const userProfileComposable = read("app/composables/useUserProfile.ts");
const authSessionComposable = read("app/composables/useAuthSession.ts");

describe("confirm.vue — OAuth callback gate", () => {
  it("uses watch() not watchEffect() so async work can be awaited before redirect", () => {
    expect(confirmPage).toContain("watch(");
    expect(confirmPage).not.toContain("watchEffect(");
  });

  it("has a didRedirect guard to prevent double navigation", () => {
    expect(confirmPage).toContain("didRedirect");
  });

  it("calls clearProfile() to discard stale state before profile refresh", () => {
    expect(confirmPage).toContain("clearProfile()");
  });

  it("awaits refreshProfile() before navigating", () => {
    expect(confirmPage).toContain("await refreshProfile()");
  });

  it("uses navigateTo with replace: true", () => {
    expect(confirmPage).toContain("replace: true");
  });

  it("only clears profile when profile is absent or for a different user", () => {
    expect(confirmPage).toContain("profile.value.id !== newUser.id");
  });

  it("catches refreshProfile errors and redirects anyway", () => {
    // Must not hang on a profile fetch error — ensure catch block is present
    expect(confirmPage).toContain("} catch {");
  });
});

describe("useUserProfile — exposes clearProfile and refreshProfile", () => {
  it("exports clearProfile()", () => {
    expect(userProfileComposable).toContain("clearProfile");
    // Must appear in the return value block
    const returnBlock = userProfileComposable.slice(
      userProfileComposable.lastIndexOf("return {"),
    );
    expect(returnBlock).toContain("clearProfile");
  });

  it("exports refreshProfile()", () => {
    expect(userProfileComposable).toContain("refreshProfile");
    const returnBlock = userProfileComposable.slice(
      userProfileComposable.lastIndexOf("return {"),
    );
    expect(returnBlock).toContain("refreshProfile");
  });

  it("clearProfile() resets both profile and error to null", () => {
    const fnBody = userProfileComposable.slice(
      userProfileComposable.indexOf("function clearProfile()"),
      userProfileComposable.indexOf("function clearProfile()") + 200,
    );
    expect(fnBody).toContain("profile.value = null");
    expect(fnBody).toContain("error.value = null");
  });

  it("refreshProfile() calls fetchProfile with force=true", () => {
    const fnBody = userProfileComposable.slice(
      userProfileComposable.indexOf("async function refreshProfile()"),
      userProfileComposable.indexOf("async function refreshProfile()") + 100,
    );
    expect(fnBody).toContain("fetchProfile(true)");
  });
});

describe("useAuthSession — clears profile on logout", () => {
  it("destructures clearProfile from useUserProfile", () => {
    expect(authSessionComposable).toContain("clearProfile");
  });

  it("calls clearProfile() before navigateTo in logout", () => {
    const logoutBlock = authSessionComposable.slice(
      authSessionComposable.indexOf("async function logout"),
    );
    const clearIdx = logoutBlock.indexOf("clearProfile()");
    const navIdx = logoutBlock.indexOf('navigateTo("/user/login")');
    expect(clearIdx).toBeGreaterThanOrEqual(0);
    expect(navIdx).toBeGreaterThanOrEqual(0);
    // clearProfile must come before navigateTo
    expect(clearIdx).toBeLessThan(navIdx);
  });
});
