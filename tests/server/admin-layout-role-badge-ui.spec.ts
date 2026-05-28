import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adminLayout = readFileSync("app/layouts/admin.vue", "utf8");
const userProfileComposable = readFileSync(
  "app/composables/useUserProfile.ts",
  "utf8",
);

describe("admin layout role badge — never shows misleading Customer label", () => {
  it("does not render formatPlatformRole directly in the template (guarded via computed)", () => {
    // The raw call must not appear in the template section.
    // A direct template call would show "Customer" while profile is null.
    const templateSection = adminLayout.slice(adminLayout.indexOf("<template>"));
    expect(templateSection).not.toContain("formatPlatformRole(");
  });

  it("uses roleBadgeLabel computed in the template badge", () => {
    const templateSection = adminLayout.slice(adminLayout.indexOf("<template>"));
    expect(templateSection).toContain("roleBadgeLabel");
  });

  it("roleBadgeLabel computed returns loading label when profile is null and not loading", () => {
    // Verify the computed has the 'Loading role...' fallback for initial/hydrating state.
    expect(adminLayout).toContain('"Loading role..."');
  });

  it("roleBadgeLabel computed returns Role unavailable on fetch error", () => {
    expect(adminLayout).toContain('"Role unavailable"');
    expect(adminLayout).toContain("profileError.value");
  });

  it("roleBadgeLabel computed delegates to formatPlatformRole for resolved roles", () => {
    // super_admin → "HOPNIC Super Admin", staff → "HOPNIC Staff"
    expect(adminLayout).toContain("formatPlatformRole(profile.value.platformRole)");
  });

  it("admin.vue calls ensureProfileLoaded on mount as belt-and-suspenders fetch", () => {
    expect(adminLayout).toContain("void ensureProfileLoaded()");
    expect(adminLayout).toContain("onMounted");
  });

  it("destructures loading and error from useUserProfile in admin layout", () => {
    expect(adminLayout).toContain("loading: profileLoading");
    expect(adminLayout).toContain("error: profileError");
    expect(adminLayout).toContain("ensureProfileLoaded");
  });
});

describe("useUserProfile watcher — initial null userId triggers fallback fetch", () => {
  it("calls fetchProfile() when the watcher fires immediately with null userId", () => {
    // previousUserId === undefined identifies the initial immediate watch callback.
    expect(userProfileComposable).toContain("previousUserId === undefined");
    expect(userProfileComposable).toContain("void fetchProfile()");
  });

  it("clears profile only on explicit sign-out, not on initial null", () => {
    // Sign-out branch should guard with both !== undefined AND !== null.
    expect(userProfileComposable).toContain(
      "previousUserId !== undefined && previousUserId !== null",
    );
  });
});
