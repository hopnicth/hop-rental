<script setup lang="ts">
/**
 * DEPRECATED — `/user/checkout-payment` (query-param combined payment prototype).
 *
 * Superseded by the central manual payment request flow. The cart now creates ONE
 * `manual_payment_requests` row and routes to `/user/payments/[id]`; the durable
 * list lives at `/user/payments`. This page only redirects any stray/bookmarked
 * links there. Auth is enforced globally by @nuxtjs/supabase (no route middleware).
 */
await navigateTo("/user/payments", { redirectCode: 308 });
</script>

<template>
  <div />
</template>
