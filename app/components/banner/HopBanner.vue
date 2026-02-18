<script setup lang="ts">
const { bannerSlides } = useBanners();
</script>

<template>
  <div class="w-full bg-white">
    <UCarousel
      v-slot="{ item }"
      loop
      dots
      :autoplay="{ delay: 4000 }"
      :items="bannerSlides"
      :ui="{
        root: 'w-full',
        item: 'basis-full',
        dots: '-bottom-6',
      }"
    >
      <NuxtLink
        :to="item.linkUrl"
        :target="item.linkTarget || '_self'"
        class="block w-full"
      >
        <img
          :src="item.imageUrl"
          :alt="item.alt"
          class="h-auto w-full object-cover"
        />
      </NuxtLink>
    </UCarousel>
  </div>
</template>
