<script setup lang="ts">
import AdminPartnerCreateContainer from "~/components/admin/partners/AdminPartnerCreateContainer.vue";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["super_admin"],
});
</script>

<template>
  <AdminPartnerCreateContainer />
</template>
