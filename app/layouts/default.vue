<script setup lang="ts">
import HopHeader from "../components/HopHeader.vue";
import ChatFab from "~/components/chat/ChatFab.vue";
</script>

<template>
  <HopHeader />
  <UMain>
    <slot />
  </UMain>
  <ClientOnly>
    <ChatFab />
  </ClientOnly>
</template>
