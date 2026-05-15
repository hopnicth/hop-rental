import type { RentalBookingStatus } from "~/types/rental-booking";

export type RentalBookingHandoverReturnStatus =
  | "pending"
  | "returned_complete"
  | "returned_partial"
  | "missing"
  | "damaged";

export interface AdminBookingHandoverItem {
  id: string;
  bookingId: string;
  assetId: string | null;
  itemName: string;
  quantityPrepared: number;
  sortOrder: number;
  preparationNote: string | null;
  pickupChecked: boolean;
  quantityHandedOver: number | null;
  pickupCheckedAt: string | null;
  pickupCheckedByUserId: string | null;
  pickupNote: string | null;
  returnStatus: RentalBookingHandoverReturnStatus;
  quantityReturned: number | null;
  returnCheckedAt: string | null;
  returnCheckedByUserId: string | null;
  returnNote: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminBookingHandoverItemsResponse {
  items: AdminBookingHandoverItem[];
  bookingStatus?: RentalBookingStatus;
  editable?: boolean;
}

export interface CreateBookingHandoverItemPayload {
  itemName: string;
  quantityPrepared: number;
  preparationNote?: string | null;
  assetId?: string | null;
  sortOrder?: number | null;
}

export type UpdateBookingHandoverItemPayload = Partial<
  CreateBookingHandoverItemPayload
>;

export interface GenerateBookingHandoverItemsResponse
  extends AdminBookingHandoverItemsResponse {
  status: "created" | "already_exists";
  item: AdminBookingHandoverItem | null;
}
