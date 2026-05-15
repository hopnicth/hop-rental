import { describe, expect, it } from "vitest";
import {
  formatAuthErrorMeta,
  isLikelyAuthServerError,
  normalizeAuthError,
} from "./auth-errors";

describe("auth error helpers", () => {
  it("normalizes auth-like errors with message, code, and status", () => {
    expect(
      normalizeAuthError({
        message: " Database error saving new user ",
        code: "unexpected_failure",
        status: "500",
      }),
    ).toEqual({
      message: "Database error saving new user",
      code: "unexpected_failure",
      status: 500,
    });
  });

  it("detects likely server-side auth failures", () => {
    expect(
      isLikelyAuthServerError(
        normalizeAuthError({ message: "Database error saving new user" }),
      ),
    ).toBe(true);
    expect(
      isLikelyAuthServerError(
        normalizeAuthError({ message: "Invalid login credentials", status: 400 }),
      ),
    ).toBe(false);
  });

  it("formats status/code metadata when present", () => {
    expect(
      formatAuthErrorMeta(
        normalizeAuthError({
          message: "Internal server error",
          code: "unexpected_failure",
          status: 500,
        }),
      ),
    ).toBe("status 500, code unexpected_failure");
  });
});
