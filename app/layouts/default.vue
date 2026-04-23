<script setup lang="ts">
import HopHeader from "../components/HopHeader.vue";
import MockChatFab from "~/components/chat/MockChatFab.vue";
</script>

<template>
  <HopHeader />
  <UMain>
    <slot />
  </UMain>
  <ClientOnly>
    <MockChatFab />
  </ClientOnly>
</template>
