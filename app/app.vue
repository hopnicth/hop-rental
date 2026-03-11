<script setup lang="ts">
const isDev = import.meta.dev;
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <DevRoleSwitcher v-if="isDev" />
  </UApp>
</template>
