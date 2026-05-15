export type NormalizedAuthError = {
  message: string;
  code: string | null;
  status: number | null;
};

export function normalizeAuthError(error: unknown): NormalizedAuthError {
  const candidate =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : null;

  const rawMessage =
    typeof candidate?.message === "string"
      ? candidate.message
      : error instanceof Error
        ? error.message
        : "";
  const rawStatus = candidate?.status;

  const parsedStatus =
    typeof rawStatus === "number"
      ? rawStatus
      : typeof rawStatus === "string" && rawStatus.trim().length > 0
        ? Number(rawStatus)
        : null;

  return {
    message: rawMessage.trim() || "Unknown authentication error",
    code:
      typeof candidate?.code === "string" && candidate.code.trim().length > 0
        ? candidate.code.trim()
        : null,
    status: Number.isFinite(parsedStatus) ? parsedStatus : null,
  };
}

export function isLikelyAuthServerError(error: NormalizedAuthError): boolean {
  const message = error.message.toLowerCase();
  return Boolean(
    (typeof error.status === "number" && error.status >= 500) ||
    message.includes("database error") ||
    message.includes("error saving new user") ||
    message.includes("internal server error") ||
    message.includes("unexpected_failure") ||
    message.includes("failed to create user"),
  );
}

export function formatAuthErrorMeta(error: NormalizedAuthError): string | null {
  const meta = [
    typeof error.status === "number" ? `status ${error.status}` : null,
    error.code ? `code ${error.code}` : null,
  ].filter(Boolean);

  return meta.length > 0 ? meta.join(", ") : null;
}
