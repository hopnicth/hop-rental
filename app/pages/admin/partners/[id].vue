<script setup lang="ts">
import AdminPartnerDetailContainer from "~/components/admin/partners/AdminPartnerDetailContainer.vue";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["platform_admin", "super_admin"],
});
</script>

<template>
  <AdminPartnerDetailContainer />
</template>
