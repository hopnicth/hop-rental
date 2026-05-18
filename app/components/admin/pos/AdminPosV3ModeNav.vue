<script setup lang="ts">
type AdminPosV3Mode = "sale" | "booking" | "kyc";

const props = defineProps<{
  modelValue: AdminPosV3Mode;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: AdminPosV3Mode];
}>();

const modes: Array<{
  value: AdminPosV3Mode;
  label: string;
  helper: string;
  icon: string;
}> = [
  {
    value: "sale",
    label: "ขายขาด",
    helper: "Walk-in product purchase entry point for later phases.",
    icon: "bx:receipt",
  },
  {
    value: "booking",
    label: "Booking",
    helper: "Rental pickup/return and pickup-order operations entry.",
    icon: "bx:calendar-check",
  },
  {
    value: "kyc",
    label: "KYC",
    helper: "Customer registration and identity work will plug in later.",
    icon: "bx:id-card",
  },
];
</script>

<template>
  <div class="grid gap-2 md:grid-cols-3">
    <button
      v-for="mode in modes"
      :key="mode.value"
      type="button"
      class="rounded-2xl border p-3 text-left transition hover:bg-elevated"
      :class="
        props.modelValue === mode.value
          ? 'border-primary bg-primary/10'
          : 'border-default bg-default'
      "
      @click="emit('update:modelValue', mode.value)"
    >
      <div class="flex items-center gap-2">
        <UIcon :name="mode.icon" class="size-5 text-primary" />
        <span class="font-semibold text-default">{{ mode.label }}</span>
      </div>
      <p class="mt-2 text-xs leading-5 text-muted">{{ mode.helper }}</p>
    </button>
  </div>
</template>
