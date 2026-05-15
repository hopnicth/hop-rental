import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("auth pages UI wiring", () => {
  it("adds password visibility toggles to login and reset password pages", () => {
    const login = read("app/pages/user/login.vue");
    const resetPassword = read("app/pages/user/reset-password.vue");

    expect(login).toContain("showPassword");
    expect(login).toContain("showConfirmPassword");
    expect(login).toContain("#trailing");
    expect(login).toContain("bx:show");
    expect(login).toContain("bx:hide");

    expect(resetPassword).toContain("showPassword");
    expect(resetPassword).toContain("showConfirmPassword");
    expect(resetPassword).toContain("#trailing");
    expect(resetPassword).toContain("bx:show");
    expect(resetPassword).toContain("bx:hide");
  });

  it("surfaces signup server error details and hints", () => {
    const login = read("app/pages/user/login.vue");
    const thai = read("i18n/locales/th.json");

    expect(login).toContain("isLikelyAuthServerError");
    expect(login).toContain("formErrorDescription");
    expect(login).toContain('showError(error, "sign-up")');
    expect(thai).toContain("signUpServerError");
    expect(thai).toContain("signUpServerErrorHint");
  });
});
