<script setup lang="ts">
import AdminPartnerListContainer from "~/components/admin/partners/AdminPartnerListContainer.vue";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});
</script>

<template>
  <AdminPartnerListContainer />
</template>
