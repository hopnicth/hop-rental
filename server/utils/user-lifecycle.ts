import { createError } from "h3";

export type AccountLifecycleAction = "deactivate" | "request_deletion";

export const USER_LIFECYCLE_SELECT =
  "id, account_status, deactivation_requested_at, deletion_requested_at, deleted_at, anonymized_at, lifecycle_updated_at, updated_at";

export function requireAccountLifecycleAction(
  body: Record<string, unknown>,
): AccountLifecycleAction {
  if (body.action === "deactivate" || body.action === "request_deletion") {
    return body.action;
  }

  throw createError({
    statusCode: 422,
    statusMessage: "action is invalid",
  });
}

export function isMissingAccountLifecycleSchema(error: unknown) {
  const err = error as { code?: string | null; message?: string | null } | null;
  return (
    err?.code === "42703" ||
    err?.message?.includes("account_status") === true ||
    err?.message?.includes("deactivation_requested_at") === true ||
    err?.message?.includes("deletion_requested_at") === true
  );
}

export function assertLifecycleTransitionAllowed(
  action: AccountLifecycleAction,
  currentStatus: unknown,
) {
  const status = typeof currentStatus === "string" ? currentStatus : "active";
  if (["deleted", "anonymized"].includes(status)) {
    throw createError({
      statusCode: 409,
      statusMessage: "Account lifecycle state is already final",
    });
  }

  if (action === "deactivate" && status === "deletion_requested") {
    throw createError({
      statusCode: 409,
      statusMessage: "Account deletion has already been requested",
    });
  }
}
