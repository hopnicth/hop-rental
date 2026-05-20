import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  body: {} as Record<string, unknown>,
  platformRole: "staff" as string,
  branchAccess: true,
  bookingRow: null as Record<string, unknown> | null,
  existingPosAttempt: null as Record<string, unknown> | null,
  insertAttemptError: null as { code?: string; message?: string } | null,
  insertedAttempts: [] as Record<string, unknown>[],
  updatedAttempts: [] as Record<string, unknown>[],
  updatedBookings: [] as Record<string, unknown>[],
  confirmShouldFail: false,
  availabilityConflict: false,
  heldBalanceEventCalls: [] as Record<string, unknown>[],
  // Document issuance tracking
  issueDocumentShouldFail: false,
  documentAlreadyIssued: false,
  existingDocumentTask: null as Record<string, unknown> | null,
  insertTaskError: null as { code?: string; message?: string } | null,
  documentTasksInserted: [] as Record<string, unknown>[],
  documentTasksUpdated: [] as Record<string, unknown>[],
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  readBody: async () => mockState.body,
  createError: (opts: { statusCode?: number; statusMessage?: string }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

vi.mock("~~/server/utils/rental-booking-availability", async () => {
  const { createError } = await import("h3");
  return {
    assertRentalBookingAvailability: vi.fn(async () => {
      if (mockState.availabilityConflict)
        throw createError({
          statusCode: 409,
          statusMessage: "RENTAL_BOOKING_CONFLICT",
        });
    }),
  };
});

vi.mock("~~/server/utils/rental-held-balance-events", () => ({
  recordBookingDepositHeldBalanceCollection: vi.fn(
    async (input: Record<string, unknown>) => {
      mockState.heldBalanceEventCalls.push({ ...input });
      // Return a minimal held-balance event row so finalizer can read .id
      return {
        id: "event-1",
        event_type: "booking_deposit_collection",
        amount: input.amount,
        currency_code: "THB",
        source_type: input.sourceType,
        source_id: input.sourceId,
        payment_method: input.paymentMethod ?? "cash",
        occurred_at: new Date().toISOString(),
      };
    },
  ),
}));

vi.mock(
  "~~/server/utils/admin-rental-booking-deposit-confirmation-document",
  () => ({
    issueBookingDepositConfirmationDocument: vi.fn(async () => {
      if (mockState.issueDocumentShouldFail) {
        const err: any = new Error("DOCUMENT_ISSUANCE_ERROR");
        err.statusCode = 500;
        throw err;
      }
      return {
        document: {
          id: "doc-1",
          documentType: "rental_booking_deposit_confirmation",
          documentNo: "BDC-202605-0001",
          status: "issued",
          issuedAt: "2026-05-21T10:00:00.000Z",
          sourceType: "rental_held_balance_event",
          sourceId: "event-1",
          currencyCode: "THB",
          subtotal: 200,
          vatAmount: 0,
          totalAmount: 200,
          templateKey: "rental_booking_deposit_confirmation_v1",
          templateVersion: 1,
          snapshot: {},
          printCount: 0,
          lastPrintedAt: null,
          branchId: "branch-hq",
        },
        alreadyIssued: mockState.documentAlreadyIssued,
      };
    }),
    BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE:
      "rental_booking_deposit_confirmation",
    BOOKING_DEPOSIT_CONFIRMATION_TITLE_TH: "เอกสารยืนยันการรับเงินมัดจำการจอง",
  }),
);

vi.mock("~~/server/utils/rental-booking-confirmation", async () => {
  const { createError } = await import("h3");
  return {
    confirmRentalBooking: vi.fn(async () => {
      if (mockState.confirmShouldFail)
        throw createError({
          statusCode: 409,
          statusMessage: "RENTAL_BOOKING_CONFLICT",
        });
      return { id: "booking-1", status: "confirmed" };
    }),
  };
});

vi.mock("~~/app/utils/rental-payment-lines", () => ({
  calculateBookingDepositDueNow: vi.fn(() => 200),
}));

function qr(result: { data: unknown; error: unknown }) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    single: async () => result,
    maybeSingle: async () => result,
    then: (resolve: (v: any) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return chain;
}

const baseBooking = {
  id: "booking-1",
  user_id: null,
  walk_in_phone: "0812345678",
  status: "draft",
  asset_id: "asset-1",
  sku_id: null,
  start_date: "2026-05-21",
  end_date: "2026-05-24",
  rental_days: 3,
  hub_id: "branch-hq",
  deposit_amount: 5000,
  currency_code: "THB",
  booking_deposit_payment_status: "unpaid",
  booking_deposit_paid_amount: 0,
  pos_branch_id: "branch-hq",
  pos_staff_user_id: "staff-1",
};

vi.mock("~~/server/utils/admin", () => ({
  requirePlatformAdmin: async () => ({
    adminClient: {
      from: (table: string) => {
        if (table === "admin_user_branch_access")
          return qr({
            data: mockState.branchAccess ? { branch_id: "branch-hq" } : null,
            error: null,
          });
        if (table === "rental_bookings") {
          return {
            select: () => qr({ data: mockState.bookingRow, error: null }),
            update: (payload: Record<string, unknown>) => {
              mockState.updatedBookings.push({ ...payload });
              return qr({ data: null, error: null });
            },
          };
        }
        if (table === "pos_rental_payment_attempts") {
          return {
            select: () =>
              qr({ data: mockState.existingPosAttempt, error: null }),
            insert: (payload: Record<string, unknown>) => {
              mockState.insertedAttempts.push({ ...payload });
              const result = {
                data: mockState.insertAttemptError
                  ? null
                  : { id: "attempt-1", amount: payload.amount, status: "paid" },
                error: mockState.insertAttemptError ?? null,
              };
              return { select: () => ({ single: async () => result }) };
            },
            update: (payload: Record<string, unknown>) => {
              mockState.updatedAttempts.push({ ...payload });
              return qr({ data: null, error: null });
            },
          };
        }
        if (table === "pos_document_issuance_tasks") {
          return {
            insert: (payload: Record<string, unknown>) => {
              const insertErr = mockState.insertTaskError;
              const taskRow = insertErr
                ? null
                : {
                    id: "task-1",
                    status: "pending",
                    official_document_id: null,
                    attempt_count: 0,
                    ...payload,
                  };
              if (!insertErr)
                mockState.documentTasksInserted.push(
                  taskRow as Record<string, unknown>,
                );
              return {
                select: () => ({
                  single: async () => ({
                    data: taskRow,
                    error: insertErr ?? null,
                  }),
                }),
              };
            },
            select: () => {
              const chain: any = {
                eq: () => chain,
                maybeSingle: async () => ({
                  data: mockState.existingDocumentTask,
                  error: null,
                }),
              };
              return chain;
            },
            update: (payload: Record<string, unknown>) => {
              mockState.documentTasksUpdated.push({ ...payload });
              return qr({ data: null, error: null });
            },
          };
        }
        // Tables accessed only by the A3 issuance utility (mocked at module level)
        if (
          table === "official_documents" ||
          table === "document_events" ||
          table === "system_configs" ||
          table === "branch_document_settings"
        ) {
          return qr({ data: null, error: null });
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    },
    userId: "staff-1",
    platformRole: mockState.platformRole,
  }),
}));

const endpoint = (
  await import("../../server/api/admin/pos-v3/rental-bookings/[bookingId]/booking-deposit-payments.post")
).default;

describe("admin POS V3 booking deposit payments", () => {
  const event = { context: { params: { bookingId: "booking-1" } } };

  beforeEach(() => {
    mockState.body = {
      idempotencyKey: "pay-key-1",
      amount: 200,
      paymentMethod: "cash",
    };
    mockState.platformRole = "staff";
    mockState.branchAccess = true;
    mockState.bookingRow = { ...baseBooking };
    mockState.existingPosAttempt = null;
    mockState.insertAttemptError = null;
    mockState.insertedAttempts = [];
    mockState.updatedAttempts = [];
    mockState.updatedBookings = [];
    mockState.confirmShouldFail = false;
    mockState.availabilityConflict = false;
    mockState.heldBalanceEventCalls = [];
    mockState.issueDocumentShouldFail = false;
    mockState.documentAlreadyIssued = false;
    mockState.existingDocumentTask = null;
    mockState.insertTaskError = null;
    mockState.documentTasksInserted = [];
    mockState.documentTasksUpdated = [];
  });

  it("happy path: records attempt, held-balance event, updates booking, confirms", async () => {
    const result = await endpoint(event);

    expect(result.status).toBe("confirmed");
    expect(result.paymentAttemptId).toBe("attempt-1");
    expect(result.booking).toMatchObject({
      id: "booking-1",
      status: "confirmed",
      bookingDepositPaidAmount: 200,
      currencyCode: "THB",
    });
    expect(mockState.insertedAttempts).toHaveLength(1);
    expect(mockState.insertedAttempts[0]).toMatchObject({
      rental_booking_id: "booking-1",
      payment_purpose: "booking_deposit",
      payment_method: "cash",
      amount: 200,
      status: "paid",
      branch_id: "branch-hq",
      staff_user_id: "staff-1",
      idempotency_key: "pay-key-1",
    });
    expect(mockState.heldBalanceEventCalls).toHaveLength(1);
    expect(mockState.heldBalanceEventCalls[0]).toMatchObject({
      amount: 200,
      sourceType: "pos_rental_payment_attempt",
      sourceId: "attempt-1",
      paymentMethod: "cash",
      branchId: "branch-hq",
    });
    expect(mockState.updatedBookings).toHaveLength(1);
    expect(mockState.updatedBookings[0]).toMatchObject({
      booking_deposit_payment_status: "paid",
      booking_deposit_paid_amount: 200,
      booking_deposit_pos_attempt_id: "attempt-1",
    });
  });

  it("idempotency: returns existing attempt without re-processing", async () => {
    mockState.existingPosAttempt = {
      id: "attempt-existing",
      amount: 200,
      status: "paid",
    };

    const result = await endpoint(event);

    expect(result.idempotent).toBe(true);
    expect(result.paymentAttemptId).toBe("attempt-existing");
    expect(mockState.insertedAttempts).toHaveLength(0);
    expect(mockState.heldBalanceEventCalls).toHaveLength(0);
  });

  it("idempotency: throws 409 if same key has conflicting amount", async () => {
    mockState.existingPosAttempt = {
      id: "attempt-existing",
      amount: 500,
      status: "paid",
    };

    await expect(endpoint(event)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: "IDEMPOTENCY_KEY_AMOUNT_CONFLICT",
    });
  });

  it("transitions to paid_confirm_failed if confirmation fails after cash collected", async () => {
    mockState.confirmShouldFail = true;

    const result = await endpoint(event);

    expect(result.status).toBe("paid_confirm_failed");
    expect(result.paymentAttemptId).toBe("attempt-1");
    expect(result.warnings).toContain(
      "BOOKING_CONFIRMATION_FAILED_MANUAL_REVIEW_REQUIRED",
    );
    // Attempt flagged
    expect(mockState.updatedAttempts).toHaveLength(1);
    expect(mockState.updatedAttempts[0]).toMatchObject({
      status: "paid_confirm_failed",
    });
    // Booking first set to paid, then to paid_confirm_failed
    expect(mockState.updatedBookings).toHaveLength(2);
    expect(mockState.updatedBookings[0]).toMatchObject({
      booking_deposit_payment_status: "paid",
    });
    expect(mockState.updatedBookings[1]).toMatchObject({
      booking_deposit_payment_status: "paid_confirm_failed",
    });
  });

  it("rejects non-draft booking status", async () => {
    mockState.bookingRow = { ...baseBooking, status: "confirmed" };

    await expect(endpoint(event)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "Only draft bookings can be finalized",
    });
    expect(mockState.insertedAttempts).toHaveLength(0);
  });

  it("rejects already-paid booking deposit", async () => {
    mockState.bookingRow = {
      ...baseBooking,
      booking_deposit_payment_status: "paid",
    };

    await expect(endpoint(event)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: "BOOKING_DEPOSIT_PAYMENT_ALREADY_CAPTURED",
    });
    expect(mockState.insertedAttempts).toHaveLength(0);
  });

  // Phase 2D-B6: paid_confirm_failed double-payment safety guard
  it("rejects paid_confirm_failed deposit — double-payment safety", async () => {
    mockState.bookingRow = {
      ...baseBooking,
      booking_deposit_payment_status: "paid_confirm_failed",
    };

    await expect(endpoint(event)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: "BOOKING_DEPOSIT_PAYMENT_ALREADY_CAPTURED",
    });
    expect(mockState.insertedAttempts).toHaveLength(0);
  });

  it("rejects missing idempotency key", async () => {
    mockState.body = { amount: 200, paymentMethod: "cash" };

    await expect(endpoint(event)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "idempotencyKey is required",
    });
  });

  it("rejects non-cash payment method", async () => {
    mockState.body = {
      idempotencyKey: "key-1",
      amount: 200,
      paymentMethod: "promptpay",
    };

    await expect(endpoint(event)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "paymentMethod must be 'cash'",
    });
  });

  it("rejects zero amount", async () => {
    mockState.body = {
      idempotencyKey: "key-1",
      amount: 0,
      paymentMethod: "cash",
    };

    await expect(endpoint(event)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "ZERO_BOOKING_DEPOSIT_FINALIZATION_NOT_ENABLED",
    });
  });

  it("rejects amount that does not match server-computed deposit", async () => {
    mockState.body = {
      idempotencyKey: "key-1",
      amount: 999,
      paymentMethod: "cash",
    };

    await expect(endpoint(event)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "BOOKING_DEPOSIT_AMOUNT_MISMATCH",
    });
  });

  it("rejects non-POS V3 booking (missing pos_branch_id)", async () => {
    mockState.bookingRow = { ...baseBooking, pos_branch_id: null };

    await expect(endpoint(event)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "Booking is not a POS V3 booking",
    });
  });

  it("rejects staff without POS branch access", async () => {
    mockState.branchAccess = false;

    await expect(endpoint(event)).rejects.toMatchObject({ statusCode: 403 });
    expect(mockState.insertedAttempts).toHaveLength(0);
  });

  it("rejects when availability is conflicted — no payment created", async () => {
    mockState.availabilityConflict = true;

    await expect(endpoint(event)).rejects.toMatchObject({ statusCode: 409 });
    expect(mockState.insertedAttempts).toHaveLength(0);
  });

  it("super_admin bypasses branch access check", async () => {
    mockState.platformRole = "super_admin";
    mockState.branchAccess = false;

    const result = await endpoint(event);

    expect(result.status).toBe("confirmed");
  });

  it("works with linked account customer (non-null user_id)", async () => {
    mockState.bookingRow = {
      ...baseBooking,
      user_id: "user-2",
      walk_in_phone: null,
    };

    const result = await endpoint(event);

    expect(result.status).toBe("confirmed");
    expect(mockState.insertedAttempts[0]).toMatchObject({
      rental_booking_id: "booking-1",
    });
  });

  // ── Phase 2C-A4: Document issuance integration tests ─────────────────────

  it("A4: success + document issued — task created, task updated to issued, response includes document", async () => {
    const result = await endpoint(event);

    expect(result.status).toBe("confirmed");
    // Task was created
    expect(mockState.documentTasksInserted).toHaveLength(1);
    expect(mockState.documentTasksInserted[0]).toMatchObject({
      document_type: "rental_booking_deposit_confirmation",
      rental_booking_id: "booking-1",
      held_balance_event_id: "event-1",
      payment_source_type: "pos_rental_payment_attempt",
      payment_source_id: "attempt-1",
      status: "pending",
    });
    // Task updated: attempt tracking + issued
    const updatePayloads = mockState.documentTasksUpdated.map(
      (u) => u.status ?? "__attempt__",
    );
    expect(updatePayloads).toContain("issued");
    // Response includes document result
    expect(result.document).toMatchObject({
      status: "issued",
      taskId: "task-1",
      officialDocumentId: "doc-1",
      documentNo: "BDC-202605-0001",
      alreadyIssued: false,
      errorCode: null,
    });
  });

  it("A4: success + A3 utility returns alreadyIssued:true — task still marked issued, response reflects alreadyIssued", async () => {
    mockState.documentAlreadyIssued = true;

    const result = await endpoint(event);

    expect(result.status).toBe("confirmed");
    expect(result.document).toMatchObject({
      status: "issued",
      alreadyIssued: true,
      officialDocumentId: "doc-1",
      errorCode: null,
    });
    // Task still updated to issued with the existing document id
    const issuedUpdate = mockState.documentTasksUpdated.find(
      (u) => u.status === "issued",
    );
    expect(issuedUpdate).toBeDefined();
    expect(issuedUpdate?.official_document_id).toBe("doc-1");
  });

  it("A4: success + document issuance fails — booking stays confirmed, task marked failed, response includes failed document", async () => {
    mockState.issueDocumentShouldFail = true;

    const result = await endpoint(event);

    // Phase A: booking confirmed, payment paid — UNCHANGED
    expect(result.status).toBe("confirmed");
    expect(result.paymentAttemptId).toBe("attempt-1");
    expect(result.booking).toMatchObject({
      id: "booking-1",
      status: "confirmed",
      bookingDepositPaymentStatus: "paid",
    });
    // Phase B: document failed — task updated to failed
    const failedUpdate = mockState.documentTasksUpdated.find(
      (u) => u.status === "failed",
    );
    expect(failedUpdate).toBeDefined();
    expect(failedUpdate?.error_code).toMatch(
      /HTTP_500|DOCUMENT_ISSUANCE_FAILED/,
    );
    expect(failedUpdate?.error_message).toBeTruthy();
    // Response indicates document failed
    expect(result.document).toMatchObject({
      status: "failed",
      taskId: "task-1",
      officialDocumentId: null,
      errorCode: expect.stringMatching(/HTTP_500|DOCUMENT_ISSUANCE_FAILED/),
    });
    // paid_confirm_failed NOT used
    expect(result.status).not.toBe("paid_confirm_failed");
    const confirmFailUpdate = mockState.updatedAttempts.find(
      (u) => u.status === "paid_confirm_failed",
    );
    expect(confirmFailUpdate).toBeUndefined();
  });

  it("A4: idempotent replay — task already issued — short-circuits without re-issuing", async () => {
    mockState.insertTaskError = { code: "23505", message: "unique violation" };
    mockState.existingDocumentTask = {
      id: "task-existing",
      status: "issued",
      official_document_id: "doc-existing",
      attempt_count: 1,
    };

    const result = await endpoint(event);

    expect(result.status).toBe("confirmed");
    // No new task row inserted (conflict returned existing)
    expect(mockState.documentTasksInserted).toHaveLength(0);
    // No attempt tracking update (short-circuited)
    const attemptUpdate = mockState.documentTasksUpdated.find(
      (u) => u.last_attempted_at !== undefined,
    );
    expect(attemptUpdate).toBeUndefined();
    // Response reflects already-issued
    expect(result.document).toMatchObject({
      status: "issued",
      taskId: "task-existing",
      officialDocumentId: "doc-existing",
      alreadyIssued: true,
    });
  });

  it("A4: task insert fails with non-23505 error (e.g. missing table) — booking confirmed, document still issued, taskId null", async () => {
    // Reproduces the real production failure: migration 091 not yet applied,
    // pos_document_issuance_tasks does not exist → PostgREST 42P01 error.
    // Expected: best-effort task tracking is skipped; document issuance proceeds.
    mockState.insertTaskError = {
      code: "42P01",
      message: 'relation "public.pos_document_issuance_tasks" does not exist',
    };

    const result = await endpoint(event);

    // Booking confirmed, payment recorded — UNAFFECTED
    expect(result.status).toBe("confirmed");
    expect(result.paymentAttemptId).toBe("attempt-1");
    expect(result.booking).toMatchObject({
      id: "booking-1",
      status: "confirmed",
      bookingDepositPaymentStatus: "paid",
    });
    // No task row inserted (table unavailable)
    expect(mockState.documentTasksInserted).toHaveLength(0);
    // Document was still issued (best-effort — no task tracking needed)
    expect(result.document).toMatchObject({
      status: "issued",
      taskId: null, // no task row available
      officialDocumentId: "doc-1",
      documentNo: "BDC-202605-0001",
      errorCode: null,
    });
  });

  it("A4: paid_confirm_failed path — no document issuance task created", async () => {
    mockState.confirmShouldFail = true;

    const result = await endpoint(event);

    // Phase A failed — still paid_confirm_failed
    expect(result.status).toBe("paid_confirm_failed");
    expect(result.warnings).toContain(
      "BOOKING_CONFIRMATION_FAILED_MANUAL_REVIEW_REQUIRED",
    );
    // No document task created — document issuance never runs on failed Phase A
    expect(mockState.documentTasksInserted).toHaveLength(0);
    expect(mockState.documentTasksUpdated).toHaveLength(0);
    // No document field on paid_confirm_failed response
    expect(result.document).toBeUndefined();
  });
});
