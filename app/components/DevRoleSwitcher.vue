<script setup lang="ts">
/**
 * DEV ONLY — Floating role switcher for testing role-dependent UI.
 *
 * Shows 3 buttons to switch between B2C / B2B User / B2B Admin
 * without needing real database data.
 *
 * Rendered globally in app.vue when `import.meta.dev` is true.
 * Affects every page that reads useCompanyContext() (Account, Cart, etc.)
 */

const { __devOverrideContext, isB2C, isB2BAdmin, isB2BUser } =
  useCompanyContext();

type RoleOption = {
  key: "b2c" | "b2b_user" | "b2b_admin";
  label: string;
  icon: string;
  color: "info" | "success" | "warning";
};

const roles: RoleOption[] = [
  { key: "b2c", label: "B2C", icon: "bx:user", color: "info" },
  { key: "b2b_user", label: "B2B User", icon: "bx:briefcase", color: "success" },
  { key: "b2b_admin", label: "B2B Admin", icon: "bx:shield", color: "warning" },
];

const currentLabel = computed(() => {
  if (isB2BAdmin.value) return "B2B Admin";
  if (isB2BUser.value) return "B2B User";
  return "B2C";
});

function isActive(key: string): boolean {
  if (key === "b2c") return isB2C.value;
  if (key === "b2b_admin") return isB2BAdmin.value;
  if (key === "b2b_user") return isB2BUser.value;
  return false;
}

const expanded = ref(false);
</script>

<template>
  <div class="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2">
    <!-- Expanded panel -->
    <Transition name="fade">
      <div
        v-if="expanded"
        class="flex flex-col gap-1.5 rounded-lg border border-dashed border-yellow-400 bg-gray-900/95 p-3 shadow-xl"
      >
        <p class="mb-1 text-xs font-bold tracking-wider text-yellow-400 uppercase">
          🛠 Dev Role Switcher
        </p>
        <UButton
          v-for="role in roles"
          :key="role.key"
          :icon="role.icon"
          :label="role.label"
          :color="role.color"
          :variant="isActive(role.key) ? 'solid' : 'outline'"
          size="sm"
          class="justify-start"
          @click="__devOverrideContext(role.key)"
        />
      </div>
    </Transition>

    <!-- Toggle button -->
    <UButton
      icon="bx:cog"
      :label="`DEV: ${currentLabel}`"
      color="warning"
      variant="solid"
      size="xs"
      class="shadow-lg"
      @click="expanded = !expanded"
    />
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

