<script setup lang="ts">
import SearchBar from "~/components/search/SearchBar.vue";

withDefaults(
  defineProps<{
    autofocus?: boolean;
  }>(),
  {
    autofocus: false,
  },
);
</script>

<template>
  <SearchBar :autofocus="autofocus" />
</template>
