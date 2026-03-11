<script setup lang="ts">
import { CalendarDate, today, getLocalTimeZone } from "@internationalized/date";
import type { Product, ProductSKU } from "~/types/product";

/**
 * RentalBookingForm — Calendar picker + day input for rental booking.
 *
 * Props:
 *  - product:     The product being rented
 *  - selectedSku: The currently selected SKU
 *
 * Emits:
 *  - submit: { startDate, numDays, returnDate, totalCost }
 *  - cancel: user dismissed the form
 */

const props = withDefaults(
  defineProps<{
    product: Product;
    selectedSku: ProductSKU;
    loading?: boolean;
  }>(),
  {
    loading: false,
  },
);

const emit = defineEmits<{
  submit: [
    payload: {
      startDate: string;
      numDays: number;
      returnDate: string;
      totalCost: number;
      deposit: number;
    },
  ];
  cancel: [];
}>();

const { t } = useI18n();

// ── Config shortcuts ──
const minDays = computed(() => props.product.rentalConfig.minDays || 1);
const maxDays = computed(() => props.product.rentalConfig.maxDays || 365);
const bufferDays = computed(() => props.product.rentalConfig.bufferDays || 0);

// ── Calendar state ──
const todayDate = today(getLocalTimeZone());
const minDate = computed(() => todayDate.add({ days: bufferDays.value }));

const startDate = shallowRef<CalendarDate | undefined>(undefined);
const numDays = ref(minDays.value);

// ── Derived values ──
const returnDate = computed(() => {
  if (!startDate.value) return undefined;
  return startDate.value.add({ days: numDays.value });
});

const dailyRate = computed(() => props.selectedSku.rentalPrice.daily);
const deposit = computed(() => props.selectedSku.rentalPrice.deposit);

const totalCost = computed(() => {
  return dailyRate.value * numDays.value;
});

// ── Validation ──
const isValid = computed(() => {
  if (!startDate.value) return false;
  if (numDays.value < minDays.value) return false;
  if (maxDays.value > 0 && numDays.value > maxDays.value) return false;
  return true;
});

// ── Format CalendarDate → ISO string ──
function toISO(d: CalendarDate): string {
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

// ── Format CalendarDate → display string ──
function formatDate(d: CalendarDate | undefined): string {
  if (!d) return "—";
  return toISO(d);
}

// ── Submit ──
function handleSubmit() {
  if (props.loading || !isValid.value || !startDate.value || !returnDate.value)
    return;
  emit("submit", {
    startDate: toISO(startDate.value),
    numDays: numDays.value,
    returnDate: toISO(returnDate.value),
    totalCost: totalCost.value,
    deposit: deposit.value,
  });
}

// ── Clamp numDays when it changes ──
watch(numDays, (val) => {
  if (val < minDays.value) numDays.value = minDays.value;
  if (maxDays.value > 0 && val > maxDays.value) numDays.value = maxDays.value;
});
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold">{{ t("booking.title") }}</h3>
        <UButton
          icon="bx:x"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="props.loading"
          @click="emit('cancel')"
        />
      </div>
    </template>

    <div
      class="space-y-4"
      :class="{ 'pointer-events-none opacity-60': props.loading }"
    >
      <!-- Calendar -->
      <div>
        <p class="mb-2 text-sm font-medium">{{ t("booking.startDate") }}</p>
        <UCalendar v-model="startDate" :min-value="minDate" />
      </div>

      <!-- Number of days -->
      <div>
        <p class="mb-2 text-sm font-medium">{{ t("booking.numDays") }}</p>
        <UInput
          v-model.number="numDays"
          type="number"
          :min="minDays"
          :max="maxDays > 0 ? maxDays : undefined"
          :disabled="props.loading"
        />
        <p class="mt-1 text-xs text-gray-400">
          {{ t("booking.minDays", { min: minDays }) }}
          <span v-if="maxDays > 0">
            · {{ t("booking.maxDays", { max: maxDays }) }}
          </span>
        </p>
      </div>

      <!-- Return date + cost summary -->
      <div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-900 space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-gray-500">{{ t("booking.returnDate") }}</span>
          <span class="font-semibold">{{ formatDate(returnDate) }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">{{ t("productDetail.deposit") }}</span>
          <span class="font-semibold"> ฿{{ deposit.toLocaleString() }} </span>
        </div>
        <div class="flex justify-between border-t pt-2">
          <span class="text-gray-500">{{ t("booking.totalCost") }}</span>
          <span class="text-lg font-bold text-primary">
            ฿{{ totalCost.toLocaleString() }}
          </span>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex gap-3 justify-end">
        <UButton
          :label="t('booking.cancel')"
          color="neutral"
          variant="outline"
          :disabled="props.loading"
          @click="emit('cancel')"
        />
        <UButton
          :label="
            props.loading ? t('booking.confirming') : t('booking.confirm')
          "
          color="primary"
          icon="bx:calendar-check"
          :loading="props.loading"
          :disabled="props.loading || !isValid"
          @click="handleSubmit"
        />
      </div>
    </template>
  </UCard>
</template>
