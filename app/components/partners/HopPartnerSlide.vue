<script setup lang="ts">
import IconSlide from "~/components/IconSlide/IconSlide.vue";

/**
 * HopPartnerSlide — Partner brands marquee
 *
 * Uses usePartners() to load partner data and passes it to the generic IconSlide component.
 *
 * TODO next step: เปลี่ยน link เป็น /product?brand=BrandName
 * เมื่อหน้า Product + brand search พร้อมใช้งาน
 */
const { partnerItems } = usePartners();
</script>

<template>
  <IconSlide :items="partnerItems" :speed="25" height="40px" />
</template>
