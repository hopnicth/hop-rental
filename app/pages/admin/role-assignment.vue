<script setup lang="ts">
import { getAdminApiErrorMessage } from "~/utils/admin-api";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["super_admin"],
});

type RoleAssignResult = {
  userId: string;
  platformRole: string;
};

const ROLE_OPTIONS = [
  { label: "Customer", value: "customer" },
  { label: "HOPNIC Staff", value: "staff" },
  { label: "HOPNIC Super Admin", value: "super_admin" },
];

const toast = useToast();

const userId = ref("");
const selectedRole = ref<string | null>(null);
const submitting = ref(false);
const result = ref<RoleAssignResult | null>(null);
const errorMessage = ref<string | null>(null);

function reset() {
  result.value = null;
  errorMessage.value = null;
}

async function handleSubmit() {
  reset();

  if (!userId.value.trim()) {
    errorMessage.value = "Please enter a User ID";
    return;
  }
  if (!selectedRole.value) {
    errorMessage.value = "Please select a role";
    return;
  }

  submitting.value = true;
  try {
    const data = await $fetch<RoleAssignResult>("/api/admin/users/role", {
      method: "PATCH",
      body: { userId: userId.value.trim(), role: selectedRole.value },
    });
    result.value = data;
    toast.add({
      title: "Role assigned",
      description: `User ${data.userId} → ${data.platformRole}`,
      color: "success",
      icon: "bx:check-circle",
    });
  } catch (err) {
    errorMessage.value = getAdminApiErrorMessage(err, "Failed to assign role");
    toast.add({
      title: "Failed to assign role",
      description: errorMessage.value,
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    submitting.value = false;
  }
}

const roleColorMap: Record<string, "primary" | "warning" | "neutral"> = {
  super_admin: "primary",
  staff: "warning",
  customer: "neutral",
};
</script>

<template>
  <div class="mx-auto max-w-lg space-y-6">
    <UCard>
      <template #header>
        <div>
          <h2 class="text-lg font-semibold">Role Assignment</h2>
          <p class="text-sm text-muted">
            Assign platform role to a user by their ID
          </p>
        </div>
      </template>

      <div class="space-y-4">
        <UFormField label="User ID" required>
          <UInput
            v-model="userId"
            class="w-full font-mono"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            :disabled="submitting"
            @input="reset"
          />
        </UFormField>

        <UFormField label="Platform Role" required>
          <USelect
            v-model="selectedRole"
            :items="ROLE_OPTIONS"
            value-key="value"
            placeholder="Select a role..."
            class="w-full"
            :disabled="submitting"
            @update:model-value="reset"
          />
        </UFormField>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="soft"
          :title="errorMessage"
          icon="bx:error-circle"
        />

        <div
          v-if="result"
          class="rounded-xl border border-default bg-neutral-50 p-4 space-y-2"
        >
          <p class="text-sm font-medium text-muted">Result</p>
          <div class="flex flex-wrap items-center gap-2">
            <p class="font-mono text-sm break-all">{{ result.userId }}</p>
            <UBadge
              :color="roleColorMap[result.platformRole] ?? 'neutral'"
              variant="soft"
            >
              {{ result.platformRole }}
            </UBadge>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end">
          <UButton
            color="primary"
            icon="bx:shield"
            :loading="submitting"
            :disabled="!userId.trim() || !selectedRole"
            @click="handleSubmit"
          >
            Assign Role
          </UButton>
        </div>
      </template>
    </UCard>
  </div>
</template>
