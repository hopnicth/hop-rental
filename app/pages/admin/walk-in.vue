<script setup lang="ts">
definePageMeta({
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

await navigateTo("/admin/pos", { replace: true });
</script>

<template>
  <div class="p-4 text-sm text-muted">Redirecting to POS…</div>
</template>