export type AdminApiWarning = {
  code: string;
  title: string;
  message: string;
};

export type AdminApiMeta = {
  adminMode?: "full" | "read_only";
  warning?: AdminApiWarning | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function getAdminApiWarning(value: unknown): AdminApiWarning | null {
  const root = asRecord(value);
  const response = asRecord(root?.response);
  const payload = asRecord(root?.data) ?? asRecord(response?._data) ?? root;
  const warning = asRecord(payload?.warning) ?? asRecord(payload?.data) ?? payload;

  if (
    typeof warning?.code === "string" &&
    typeof warning?.message === "string"
  ) {
    return {
      code: warning.code,
      title:
        typeof warning.title === "string" && warning.title.length > 0
          ? warning.title
          : "Admin API warning",
      message: warning.message,
    };
  }

  return null;
}

export function getAdminApiErrorMessage(
  error: unknown,
  fallback = "Unknown error",
): string {
  const warning = getAdminApiWarning(error);
  if (warning) return warning.message;

  const root = asRecord(error);
  const response = asRecord(root?.response);
  const payload = asRecord(root?.data) ?? asRecord(response?._data) ?? root;
  const candidates = [
    payload?.statusMessage,
    payload?.message,
    root?.statusMessage,
    root?.message,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return fallback;
}