function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function formatJsonText(
  value: unknown,
  fallback: "object" | "array" = "object",
) {
  const normalized =
    value == null ? (fallback === "array" ? [] : {}) : value;

  return JSON.stringify(normalized, null, 2);
}

export function parseJsonObjectText(text: string, label: string) {
  if (text.trim().length === 0) return {};

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }

  return parsed;
}

export function parseJsonArrayText(text: string, label: string) {
  if (text.trim().length === 0) return [];

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array`);
  }

  return parsed;
}

export function formatIsoDate(value?: string) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}