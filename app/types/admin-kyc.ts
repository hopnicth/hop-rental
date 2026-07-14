/**
 * Client-side mirrors of the server KYC safe shapes for the Admin KYC
 * Documents Panel.
 *
 *  - AdminKycProfile  mirrors SafeKycProfile  (server/utils/kyc-profile-view.ts)
 *  - AdminKycDocument mirrors SafeKycDocument (server/utils/kyc-document-view.ts)
 *
 * These are SAFE METADATA ONLY by server construction — no storage paths, no
 * bucket names, no signed/public URLs, no raw identity values, no uploader
 * ids. Do NOT add such fields here; the server whitelist mappers are the
 * source of truth.
 */

export interface AdminKycProfile {
  id: string;
  holderName?: string | null;
  customerType: string;
  identityType: string;
  identityLast4: string;
  status: string;
  validUntil: string | null;
  branchId: string | null;
  createdAt: string;
  verifiedAt: string | null;
  verifiedBranchId: string | null;
  hasUserId: boolean;
}

export interface AdminKycDocument {
  id: string;
  kycProfileId: string;
  documentType: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  uploadedAt: string;
  createdAt: string;
}
