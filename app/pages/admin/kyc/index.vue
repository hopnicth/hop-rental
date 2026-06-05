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
 * Access: staff + super_admin (lookup/list/upload are platform-admin APIs).
 * Document download inside the panel is super_admin only.
 */
import AdminKycDocumentsPanel from "~/components/admin/kyc/AdminKycDocumentsPanel.vue";
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
    </template>
  </div>
</template>
