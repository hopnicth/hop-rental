<script setup lang="ts">
import HopHeader from "../components/HopHeader.vue";
import AppFooter from "~/components/layout/AppFooter.vue";
import ChatFab from "~/components/chat/ChatFab.vue";
import CookieConsentBanner from "~/components/cookie/CookieConsentBanner.vue";
</script>

<template>
  <div>
    <HopHeader />
    <UMain>
      <slot />
    </UMain>
    <AppFooter />
    <ClientOnly>
      <ChatFab />
    </ClientOnly>
    <CookieConsentBanner />
  </div>
</template>
