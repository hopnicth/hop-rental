<script setup lang="ts">
/**
 * /admin/kyc — KYC customer lookup + documents panel (staging Admin KYC v1).
 *
 * Lookup-first by design: there is deliberately NO "browse all profiles" API.
 * The identity value is sent in a POST body (never a query string / loggable
 * URL) via the existing /api/admin/kyc/profiles/lookup endpoint, and the raw
 * value is CLEARED from component state after every lookup — display uses the
 * masked identityLast4 from the response only.
 *
 * Minimal admin intake: when no profile is selected, a "Create pending KYC
 * profile" form posts to the existing /api/admin/kyc/profiles endpoint
 * (always status 'pending'; server dedupes walk-in identities) and feeds the
 * returned SafeKycProfile into the SAME render path as a lookup hit. The raw
 * identity value is cleared from state after every create submit too.
 *
 * Access: staff + super_admin (lookup/create/list/upload are platform-admin APIs).
 * Document download inside the panel is super_admin only.
 */
import AdminKycDocumentsPanel from "~/components/admin/kyc/AdminKycDocumentsPanel.vue";
import AdminOrderQrScanner from "~/components/admin/AdminOrderQrScanner.vue";
import type { AdminKycProfile } from "~/types/admin-kyc";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

const toast = useToast();

const IDENTITY_TYPE_OPTIONS = [
  { value: "national_id", label: "Thai national ID" },
  { value: "passport", label: "Passport" },
  { value: "juristic_id", label: "Juristic ID (company)" },
];

const STATUS_COLORS: Record<string, string> = {
  verified: "success",
  pending: "warning",
  rejected: "error",
  revoked: "error",
};

const identityType = ref("national_id");
const identityValue = ref("");
const searching = ref(false);
const searched = ref(false);
const profile = ref<AdminKycProfile | null>(null);

// ── Create pending profile (minimal admin intake) ───────────────────────────
// Mirrors the create endpoint's customerType × identityType coherence guard
// (individual → national_id | passport; company → juristic_id). Server stays
// authoritative (400 INCOHERENT_IDENTITY_FOR_CUSTOMER_TYPE).
const CUSTOMER_TYPE_OPTIONS = [
  { value: "individual", label: "Individual" },
  { value: "company", label: "Company" },
];

const CREATE_IDENTITY_OPTIONS: Record<
  string,
  Array<{ value: string; label: string }>
> = {
  individual: IDENTITY_TYPE_OPTIONS.filter((o) => o.value !== "juristic_id"),
  company: IDENTITY_TYPE_OPTIONS.filter((o) => o.value === "juristic_id"),
};

const create = reactive({
  customerType: "individual",
  identityType: "national_id",
  identityValue: "",
  holderName: "",
});

// §a: holder name (name-on-ID / company name) is required for walk-in intake;
// optional when a registered user is bound (users.full_name is the source).
const createDisabled = computed(
  () =>
    creating.value ||
    create.identityValue.trim().length === 0 ||
    (!boundUser.value && create.holderName.trim().length === 0),
);

watch(
  () => create.customerType,
  (customerType) => {
    create.identityType =
      CREATE_IDENTITY_OPTIONS[customerType]?.[0]?.value ?? "national_id";
  },
);

const creating = ref(false);

// ── User-ID QR binding (§a channel 2) ────────────────────────────────────────
// Scan customer:<userId> → resolve via /api/admin/customers/lookup → the
// create call binds the profile to that user (server validates + dedupes;
// once-per-user is DB-enforced by migration 120). Only the resolved user id +
// display name are held in state — never any identity value.
const isScannerOpen = ref(false);
const resolvingQr = ref(false);
const boundUser = ref<{ id: string; name: string } | null>(null);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function onQrDecoded(payload: { kind: string; value: string }) {
  if (payload.kind !== "customer" || !UUID_RE.test(payload.value.trim())) {
    toast.add({
      title: "Not a customer QR",
      description: "Expected a customer:<userId> QR code.",
      color: "warning",
      icon: "bx:qr",
    });
    return;
  }
  isScannerOpen.value = false;
  resolvingQr.value = true;
  try {
    const userId = payload.value.trim();
    const res = await $fetch<{
      customer: { userId: string; fullName: string | null } | null;
    }>("/api/admin/customers/lookup", { query: { userId } });
    if (!res.customer) {
      toast.add({
        title: "Customer not found",
        color: "error",
        icon: "bx:error-circle",
      });
      return;
    }
    boundUser.value = {
      id: res.customer.userId,
      name: res.customer.fullName ?? "(no name)",
    };
    toast.add({
      title: `Customer bound: ${boundUser.value.name}`,
      color: "success",
      icon: "bx:user-check",
    });
  } catch {
    toast.add({
      title: "Customer lookup failed",
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    resolvingQr.value = false;
  }
}

async function createProfile() {
  if (createDisabled.value) return;
  creating.value = true;
  try {
    const res = await $fetch<{
      profile: AdminKycProfile;
      created: boolean;
      reused: boolean;
    }>("/api/admin/kyc/profiles", {
      method: "POST",
      body: {
        customerType: create.customerType,
        identityType: create.identityType,
        identityValue: create.identityValue,
        ...(create.holderName.trim()
          ? { holderName: create.holderName.trim() }
          : {}),
        ...(boundUser.value ? { userId: boundUser.value.id } : {}),
      },
    });
    // Same render path as a lookup hit — the documents panel takes over.
    profile.value = res.profile;
    searched.value = true;
    toast.add({
      title: res.reused
        ? "Existing pending profile reused"
        : "Pending KYC profile created",
      color: "success",
      icon: "bx:check-circle",
    });
  } catch (e) {
    const err = e as { data?: { statusMessage?: string }; statusMessage?: string };
    toast.add({
      title: "Create failed",
      description:
        err?.data?.statusMessage ?? err?.statusMessage ?? "Unknown error",
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    // The raw identity value never stays in component state after a submit.
    create.identityValue = "";
    create.holderName = "";
    boundUser.value = null;
    creating.value = false;
  }
}

async function lookupProfile() {
  if (searching.value || identityValue.value.trim().length === 0) return;
  searching.value = true;
  try {
    const res = await $fetch<{ profile: AdminKycProfile | null }>(
      "/api/admin/kyc/profiles/lookup",
      {
        method: "POST",
        body: {
          identityType: identityType.value,
          identityValue: identityValue.value,
        },
      },
    );
    profile.value = res.profile;
    searched.value = true;
  } catch (e) {
    const err = e as { data?: { statusMessage?: string }; statusMessage?: string };
    toast.add({
      title: "Lookup failed",
      description:
        err?.data?.statusMessage ?? err?.statusMessage ?? "Unknown error",
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    // The raw identity value never stays in component state after a lookup —
    // the response's masked identityLast4 is the only identity ever rendered.
    identityValue.value = "";
    searching.value = false;
  }
}


// ── Super Admin approve queue (§a addendum item 1) ───────────────────────────
// Pending-only list; hidden for staff (the endpoint 403s + audit-logs them).
interface KycQueueItem {
  id: string;
  displayName: string | null;
  customerType: string;
  branchId: string | null;
  submittedAt: string;
  hasUserId: boolean;
  complete: boolean;
  missingDocumentTypes: string[];
}
const queue = ref<KycQueueItem[]>([]);
const queueVisible = ref(false);
const queueLoading = ref(false);

async function refreshQueue() {
  queueLoading.value = true;
  try {
    const res = await $fetch<{ items: KycQueueItem[] }>("/api/admin/kyc/queue");
    queue.value = res.items;
    queueVisible.value = true;
  } catch {
    // 403 for staff — queue stays hidden; lookup-first remains their path.
    queueVisible.value = false;
  } finally {
    queueLoading.value = false;
  }
}
onMounted(() => void refreshQueue());

async function openQueueItem(id: string) {
  try {
    const res = await $fetch<{ profile: AdminKycProfile }>(
      `/api/admin/kyc/profiles/${id}`,
    );
    profile.value = res.profile;
    searched.value = true;
  } catch {
    toast.add({ title: "Failed to open profile", color: "error", icon: "bx:error-circle" });
  }
}

// ── Super Admin decisions (verify / reject / revoke) ─────────────────────────
const REJECT_REASONS = [
  { value: "document_illegible", label: "Document illegible" },
  { value: "document_incomplete", label: "Document incomplete" },
  { value: "document_expired", label: "Document expired" },
  { value: "identity_mismatch", label: "Identity mismatch" },
  { value: "other", label: "Other" },
];
const REVOKE_REASONS = [
  { value: "fraud_suspected", label: "Fraud suspected" },
  { value: "document_invalid", label: "Document invalid" },
  { value: "verified_in_error", label: "Verified in error" },
  { value: "other", label: "Other" },
];
const decision = reactive({
  visualReviewConfirmed: false,
  vatStatus: "not_vat_registered",
  rejectReason: "document_incomplete",
  rejectNote: "",
  revokeReason: "document_invalid",
  busy: false,
});

async function decide(kind: "verify" | "reject" | "revoke") {
  if (!profile.value || decision.busy) return;
  decision.busy = true;
  try {
    const id = profile.value.id;
    if (kind === "verify") {
      // The reviewed set = the profile's current documents (super admin has
      // just visually reviewed them in the panel).
      const docs = await $fetch<{ documents: Array<{ id: string }> }>(
        `/api/admin/kyc/profiles/${id}/documents`,
      );
      await $fetch(`/api/admin/kyc/profiles/${id}/verify`, {
        method: "POST",
        body: {
          reviewedDocumentIds: docs.documents.map((d) => d.id),
          visualReviewConfirmed: decision.visualReviewConfirmed,
          ...(profile.value.customerType === "company"
            ? { vatStatus: decision.vatStatus }
            : {}),
        },
      });
    } else if (kind === "reject") {
      await $fetch(`/api/admin/kyc/profiles/${id}/reject`, {
        method: "POST",
        body: {
          reasonCode: decision.rejectReason,
          ...(decision.rejectNote.trim() ? { note: decision.rejectNote.trim() } : {}),
        },
      });
    } else {
      await $fetch(`/api/admin/kyc/profiles/${id}/revoke`, {
        method: "POST",
        body: { reasonCode: decision.revokeReason },
      });
    }
    toast.add({ title: `KYC ${kind} recorded`, color: "success", icon: "bx:check-circle" });
    decision.visualReviewConfirmed = false;
    decision.rejectNote = "";
    await openQueueItem(profile.value.id);
    await refreshQueue();
  } catch (e) {
    const err = e as { data?: { statusMessage?: string; data?: { missingDocumentTypes?: string[] } } };
    const missing = err?.data?.data?.missingDocumentTypes;
    toast.add({
      title: `KYC ${kind} failed`,
      description: missing?.length
        ? `Missing documents: ${missing.join(", ")}`
        : (err?.data?.statusMessage ?? "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    decision.busy = false;
  }
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { dateStyle: "medium" });
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold">KYC</h1>
      <p class="text-sm text-muted">
        Look up a customer KYC profile by identity, then manage its documents.
      </p>
    </div>

    <UCard v-if="queueVisible">
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="font-semibold">Pending approval queue</h3>
          <UButton
            icon="bx:refresh"
            size="xs"
            variant="ghost"
            color="neutral"
            :loading="queueLoading"
            aria-label="Refresh queue"
            @click="void refreshQueue()"
          />
        </div>
      </template>
      <p v-if="queue.length === 0" class="text-sm italic text-muted">
        No pending KYC submissions.
      </p>
      <ul v-else class="divide-y divide-default">
        <li
          v-for="item in queue"
          :key="item.id"
          class="flex flex-wrap items-center justify-between gap-2 py-2"
        >
          <div>
            <p class="font-medium">{{ item.displayName ?? "(no name)" }}</p>
            <p class="text-xs text-muted">
              {{ item.customerType }} · {{ item.hasUserId ? "registered" : "walk-in" }}
              · {{ formatDate(item.submittedAt) }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <UBadge
              :color="item.complete ? 'success' : 'warning'"
              variant="subtle"
            >
              {{ item.complete ? "documents complete" : `missing: ${item.missingDocumentTypes.join(", ")}` }}
            </UBadge>
            <UButton
              size="xs"
              variant="soft"
              label="Open"
              @click="void openQueueItem(item.id)"
            />
          </div>
        </li>
      </ul>
    </UCard>

    <UCard>
      <template #header>
        <h3 class="font-semibold">Customer lookup</h3>
      </template>
      <form
        class="flex flex-wrap items-end gap-3"
        @submit.prevent="void lookupProfile()"
      >
        <UFormField label="Identity type">
          <USelect
            v-model="identityType"
            :items="IDENTITY_TYPE_OPTIONS"
            class="w-56"
          />
        </UFormField>
        <UFormField label="Identity value" hint="Sent securely; never stored">
          <UInput
            v-model="identityValue"
            placeholder="Identity number"
            autocomplete="off"
            class="w-64"
          />
        </UFormField>
        <UButton
          type="submit"
          label="Look up"
          color="primary"
          :loading="searching"
          :disabled="searching || identityValue.trim().length === 0"
        />
      </form>
    </UCard>

    <p
      v-if="searched && !profile"
      class="text-sm italic text-muted"
    >
      No KYC profile found for that identity.
    </p>

    <UCard v-if="!profile">
      <template #header>
        <h3 class="font-semibold">Create pending KYC profile</h3>
      </template>
      <p class="mb-3 text-sm text-muted">
        Walk-in intake: creates a <span class="font-medium">pending</span>
        profile (or reuses an existing walk-in profile for the same identity),
        then documents can be uploaded below. Scan a customer QR to bind the
        profile to a registered user instead.
      </p>
      <div class="mb-3 flex flex-wrap items-center gap-3">
        <UButton
          icon="bx:qr-scan"
          variant="soft"
          color="neutral"
          :loading="resolvingQr"
          label="Scan customer QR"
          @click="isScannerOpen = true"
        />
        <UBadge
          v-if="boundUser"
          color="info"
          variant="subtle"
          class="flex items-center gap-1"
        >
          Bound to: {{ boundUser.name }}
          <UButton
            icon="bx:x"
            size="xs"
            variant="ghost"
            color="neutral"
            aria-label="Unbind customer"
            @click="boundUser = null"
          />
        </UBadge>
      </div>
      <form
        class="flex flex-wrap items-end gap-3"
        @submit.prevent="void createProfile()"
      >
        <UFormField label="Customer type">
          <USelect
            v-model="create.customerType"
            :items="CUSTOMER_TYPE_OPTIONS"
            class="w-44"
          />
        </UFormField>
        <UFormField label="Identity type">
          <USelect
            v-model="create.identityType"
            :items="CREATE_IDENTITY_OPTIONS[create.customerType] ?? []"
            class="w-56"
          />
        </UFormField>
        <UFormField label="Identity value" hint="Sent securely; never stored">
          <UInput
            v-model="create.identityValue"
            placeholder="Identity number"
            autocomplete="off"
            class="w-64"
          />
        </UFormField>
        <UFormField
          label="Name on document"
          :hint="boundUser ? 'Optional (user-bound)' : 'Required for walk-in'"
        >
          <UInput
            v-model="create.holderName"
            placeholder="Name-on-ID / company name"
            autocomplete="off"
            class="w-64"
          />
        </UFormField>
        <UButton
          type="submit"
          label="Create profile"
          color="primary"
          variant="soft"
          :loading="creating"
          :disabled="createDisabled"
        />
      </form>
    </UCard>

    <template v-if="profile">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">KYC profile</h3>
            <UBadge
              :color="(STATUS_COLORS[profile.status] ?? 'neutral') as any"
              variant="subtle"
            >
              {{ profile.status }}
            </UBadge>
          </div>
        </template>
        <dl class="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt class="text-muted">Name on document</dt>
            <dd class="font-medium">{{ profile.holderName ?? "—" }}</dd>
          </div>
          <div>
            <dt class="text-muted">Customer type</dt>
            <dd class="font-medium">{{ profile.customerType }}</dd>
          </div>
          <div>
            <dt class="text-muted">Identity</dt>
            <dd class="font-medium">
              {{ profile.identityType }} ····{{ profile.identityLast4 }}
            </dd>
          </div>
          <div>
            <dt class="text-muted">Registered user</dt>
            <dd class="font-medium">{{ profile.hasUserId ? "Yes" : "Walk-in" }}</dd>
          </div>
          <div>
            <dt class="text-muted">Valid until</dt>
            <dd class="font-medium">{{ formatDate(profile.validUntil) }}</dd>
          </div>
          <div>
            <dt class="text-muted">Verified at</dt>
            <dd class="font-medium">{{ formatDate(profile.verifiedAt) }}</dd>
          </div>
          <div>
            <dt class="text-muted">Created</dt>
            <dd class="font-medium">{{ formatDate(profile.createdAt) }}</dd>
          </div>
        </dl>
      </UCard>

      <AdminKycDocumentsPanel :profile="profile" />

      <UCard v-if="queueVisible && (profile.status === 'pending' || profile.status === 'verified')">
        <template #header>
          <h3 class="font-semibold">Super admin decision</h3>
        </template>
        <div v-if="profile.status === 'pending'" class="space-y-3">
          <UCheckbox
            v-model="decision.visualReviewConfirmed"
            label="I visually reviewed all documents against §a requirements"
          />
          <div v-if="profile.customerType === 'company'" class="max-w-xs">
            <UFormField label="VAT status (attested)">
              <USelect
                v-model="decision.vatStatus"
                :items="[
                  { value: 'vat_registered', label: 'VAT registered' },
                  { value: 'not_vat_registered', label: 'Not VAT registered' },
                ]"
              />
            </UFormField>
          </div>
          <div class="flex flex-wrap items-end gap-3">
            <UButton
              color="success"
              label="Verify"
              :loading="decision.busy"
              :disabled="decision.busy || !decision.visualReviewConfirmed"
              @click="void decide('verify')"
            />
            <UFormField label="Reject reason">
              <USelect v-model="decision.rejectReason" :items="REJECT_REASONS" class="w-56" />
            </UFormField>
            <UFormField label="Note (optional)">
              <UInput v-model="decision.rejectNote" class="w-64" />
            </UFormField>
            <UButton
              color="error"
              variant="soft"
              label="Reject"
              :loading="decision.busy"
              :disabled="decision.busy"
              @click="void decide('reject')"
            />
          </div>
        </div>
        <div v-else class="flex flex-wrap items-end gap-3">
          <UFormField label="Revoke reason">
            <USelect v-model="decision.revokeReason" :items="REVOKE_REASONS" class="w-56" />
          </UFormField>
          <UButton
            color="error"
            label="Revoke verification"
            :loading="decision.busy"
            :disabled="decision.busy"
            @click="void decide('revoke')"
          />
        </div>
      </UCard>
    </template>

    <AdminOrderQrScanner
      v-model:open="isScannerOpen"
      title="Scan customer QR"
      description="Point the camera at the customer's User-ID QR (customer:<userId>)."
      @decoded="onQrDecoded"
    />
  </div>
</template>
