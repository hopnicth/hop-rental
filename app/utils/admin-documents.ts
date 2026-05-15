import type { AdminRentalPrintFormType } from "~/types/admin-rental-print-form";
import type {
  AdminBookingFulfillmentStatus,
  OperationalDocumentUiState,
  OperationalRentalDocumentType,
} from "~/types/admin-documents";

export const OPERATIONAL_RENTAL_DOCUMENT_TYPES = [
  "rental_pickup_form",
  "rental_return_form",
] as const satisfies readonly OperationalRentalDocumentType[];

export const OPERATIONAL_RENTAL_DOCUMENT_LABELS: Record<
  OperationalRentalDocumentType,
  string
> = {
  rental_pickup_form: "Pickup / Handover Form",
  rental_return_form: "Return Form",
};

export const OPERATIONAL_RENTAL_DOCUMENT_PREFIXES: Record<
  OperationalRentalDocumentType,
  string
> = {
  rental_pickup_form: "PICK",
  rental_return_form: "RET",
};

export const OPERATIONAL_RENTAL_DOCUMENT_TEMPLATES: Record<
  OperationalRentalDocumentType,
  string
> = {
  rental_pickup_form: "rental_pickup_form_a5",
  rental_return_form: "rental_return_form_a5",
};

export const OPERATIONAL_RENTAL_DOCUMENT_FORM_TYPES: Record<
  OperationalRentalDocumentType,
  AdminRentalPrintFormType
> = {
  rental_pickup_form: "pickup",
  rental_return_form: "return",
};

export function isOperationalRentalDocumentType(
  value: unknown,
): value is OperationalRentalDocumentType {
  return (
    typeof value === "string" &&
    OPERATIONAL_RENTAL_DOCUMENT_TYPES.includes(
      value as OperationalRentalDocumentType,
    )
  );
}

export function documentTypeToPrintFormType(
  type: OperationalRentalDocumentType,
): AdminRentalPrintFormType {
  return OPERATIONAL_RENTAL_DOCUMENT_FORM_TYPES[type];
}

export function printFormTypeToDocumentType(
  type: AdminRentalPrintFormType,
): OperationalRentalDocumentType {
  return type === "pickup" ? "rental_pickup_form" : "rental_return_form";
}

export function getOperationalDocumentUiState(input: {
  documentType: OperationalRentalDocumentType;
  bookingStatus: string | null | undefined;
  fulfillmentStatus?: AdminBookingFulfillmentStatus | null;
}): OperationalDocumentUiState {
  const bookingStatus = String(input.bookingStatus ?? "");
  const hasPickupFulfillment = Boolean(input.fulfillmentStatus?.pickupExists);
  const hasReturnFulfillment = Boolean(input.fulfillmentStatus?.returnExists);

  if (input.documentType === "rental_pickup_form") {
    if (!["picked_up", "returned"].includes(bookingStatus)) {
      return {
        canPreview: false,
        canIssue: false,
        helperText: "Available after pickup fulfillment is completed.",
      };
    }
    if (!hasPickupFulfillment) {
      return {
        canPreview: false,
        canIssue: false,
        helperText:
          "Pickup fulfillment record not found yet. Complete pickup before previewing or issuing the Pickup Form.",
      };
    }
    return {
      canPreview: true,
      canIssue: true,
      helperText: "Ready to preview or issue after staff review.",
    };
  }

  if (bookingStatus !== "returned") {
    return {
      canPreview: false,
      canIssue: false,
      helperText: "Available after return fulfillment is completed.",
    };
  }
  if (!hasReturnFulfillment) {
    return {
      canPreview: false,
      canIssue: false,
      helperText:
        "Return fulfillment record not found yet. Complete return before previewing or issuing the Return Form.",
    };
  }
  return {
    canPreview: true,
    canIssue: true,
    helperText: "Ready to preview or issue after staff review.",
  };
}
