<script setup lang="ts">
import type { ProductSpec } from "~/types/product";

/**
 * ProductSpecTable — Displays product specifications as a key-value table.
 */

const props = defineProps<{
  spec: ProductSpec;
}>();

const hasSpec = computed(() => Object.keys(props.spec).length > 0);
</script>

<template>
  <table v-if="hasSpec" class="w-full text-sm">
    <tbody>
      <tr v-for="(value, key) in spec" :key="key" class="border-b">
        <td class="py-2 pr-4 font-medium text-gray-500 w-1/3">
          {{ key }}
        </td>
        <td class="py-2">{{ value }}</td>
      </tr>
    </tbody>
  </table>
  <p v-else class="text-gray-400">—</p>
</template>
