<script setup lang="ts">
const route = useRoute();
const { t } = useI18n();
const bookingId = computed(() => String(route.query.bookingId || ""));

onMounted(() => {
  if (bookingId.value) {
    void navigateTo(
      `/rental-booking-payment/${encodeURIComponent(bookingId.value)}`,
      {
        replace: true,
      },
    );
  } else {
    void navigateTo("/user/rentals", { replace: true });
  }
});
</script>

<template>
  <UContainer class="py-10 text-center text-muted">
    {{ t("rentalBookingPayment.returning") }}
  </UContainer>
</template>
