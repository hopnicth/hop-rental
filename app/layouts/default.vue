<script setup lang="ts">
import HopHeader from "../components/HopHeader.vue";
import ChatFab from "~/components/chat/ChatFab.vue";
import CookieConsentBanner from "~/components/cookie/CookieConsentBanner.vue";
</script>

<template>
  <HopHeader />
  <UMain>
    <slot />
  </UMain>
  <ClientOnly>
    <ChatFab />
  </ClientOnly>
  <CookieConsentBanner />
</template>
