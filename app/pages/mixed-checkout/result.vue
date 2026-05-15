<script setup lang="ts">
const route = useRoute();
const sessionId = computed(() => String(route.query.sessionId ?? ""));

onMounted(async () => {
  await navigateTo(
    sessionId.value
      ? `/mixed-checkout/${encodeURIComponent(sessionId.value)}`
      : "/user/cart",
    { replace: true },
  );
});
</script>

<template>
  <UContainer class="py-10">
    <UCard class="mx-auto max-w-lg text-center">
      <p class="text-sm text-muted">Returning to mixed checkout status…</p>
    </UCard>
  </UContainer>
</template>