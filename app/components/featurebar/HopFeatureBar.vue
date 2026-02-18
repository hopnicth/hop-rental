<script setup>
import QuotationBar from "./QuotationBar.vue";
</script>

<template>
  <UContainer class="flex w-full items-center gap-4 px-2 py-1 outline-1 outline-secondary-100 justify-end">
    <!-- Quotation Bar — cart, order history, contact sales -->
    <QuotationBar />

    <!-- ── TODO: Future zone for ChatBot / AI assistant ── -->
    <!-- <div class="ml-auto">ChatBot zone</div> -->
  </UContainer>
</template>
