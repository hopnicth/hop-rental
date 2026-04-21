<script setup lang="ts">
import type { DateValue } from "@internationalized/date";
import { CalendarDate, today, getLocalTimeZone } from "@internationalized/date";
import type { Product, ProductSKU } from "~/types/product";
import type { RentalAccess } from "~/types/rental-access";

/**
 * RentalBookingForm — Range calendar picker for rental booking.
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
    product?: Product;
    selectedSku?: ProductSKU;
    rentalAccess?: RentalAccess | null;
    loading?: boolean;
  }>(),
  {
    loading: false,
  },
);

type CalendarRangeValue = {
  start: CalendarDate;
  end: CalendarDate;
};

const DAY_MS = 24 * 60 * 60 * 1000;

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
const { blockingBookings } = useBooking();

// ── Config shortcuts ──
const minDays = computed(
  () =>
    props.rentalAccess?.rentalRules.minDays ??
    props.product?.rentalConfig.minDays ??
    1,
);
const maxDays = computed(
  () =>
    props.rentalAccess?.rentalRules.maxDays ??
    props.product?.rentalConfig.maxDays ??
    365,
);
const bufferDays = computed(
  () =>
    props.rentalAccess?.rentalRules.bufferDays ??
    props.product?.rentalConfig.bufferDays ??
    0,
);

// ── Calendar state ──
const todayDate = today(getLocalTimeZone());
const minDate = computed(() => todayDate.add({ days: bufferDays.value }));

const selectedRange = shallowRef<CalendarRangeValue | undefined>(undefined);

const relevantBookings = computed(() => {
  const skuId = props.selectedSku?.id;
  const rentalAccessId = props.rentalAccess?.id;

  if (!skuId) return [];

  return blockingBookings.value.filter((booking) => {
    if (rentalAccessId) {
      return (
        booking.rentalAccessId === rentalAccessId ||
        (!booking.rentalAccessId && booking.skuId === skuId)
      );
    }

    return booking.skuId === skuId;
  });
});

const blockedDateKeys = computed(() => {
  const keys = new Set<string>();

  for (const booking of relevantBookings.value) {
    let cursor = parseISOToUtcDate(booking.startDate);
    const end = parseISOToUtcDate(booking.returnDate);

    if (!cursor || !end) continue;

    while (cursor < end) {
      keys.add(toISODateKey(cursor));
      cursor = addUtcDays(cursor, 1);
    }
  }

  return keys;
});

const blockedDateCount = computed(() => blockedDateKeys.value.size);

// ── Derived values ──
const startDate = computed(() => selectedRange.value?.start);
const returnDate = computed(() => selectedRange.value?.end);

const numDays = computed(() => {
  if (!startDate.value || !returnDate.value) return 0;
  return diffCalendarDays(startDate.value, returnDate.value);
});

const dailyRate = computed(
  () =>
    props.rentalAccess?.pricing.daily ??
    props.selectedSku?.rentalPrice.daily ??
    0,
);
const deposit = computed(
  () =>
    props.rentalAccess?.pricing.deposit ??
    props.selectedSku?.rentalPrice.deposit ??
    0,
);

const totalCost = computed(() => {
  return dailyRate.value * numDays.value;
});

const selectionHitsBlockedDates = computed(() => {
  if (!startDate.value || !returnDate.value) return false;

  let cursor = startDate.value.toDate("UTC");
  const end = returnDate.value.toDate("UTC");

  while (cursor < end) {
    if (blockedDateKeys.value.has(toISODateKey(cursor))) {
      return true;
    }

    cursor = addUtcDays(cursor, 1);
  }

  return false;
});

// ── Validation ──
const isValid = computed(() => {
  if (!startDate.value || !returnDate.value) return false;
  if (numDays.value < minDays.value) return false;
  if (maxDays.value > 0 && numDays.value > maxDays.value) return false;
  if (selectionHitsBlockedDates.value) return false;
  return true;
});

// ── Format CalendarDate → ISO string ──
function toISO(d: CalendarDate): string {
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

function toISODateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseISOToUtcDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
}

function addUtcDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * DAY_MS);
}

function diffCalendarDays(start: CalendarDate, end: CalendarDate): number {
  return Math.max(
    0,
    Math.round(
      (end.toDate("UTC").getTime() - start.toDate("UTC").getTime()) / DAY_MS,
    ),
  );
}

function isDateBooked(date: DateValue | CalendarDate): boolean {
  return blockedDateKeys.value.has(toISODateKey(date.toDate("UTC")));
}

function isDateDisabled(date: DateValue): boolean {
  return isDateBooked(date);
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

watch([() => props.selectedSku?.id, () => props.rentalAccess?.id], () => {
  selectedRange.value = undefined;
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
        <div class="mb-2 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p class="text-sm font-medium">{{ t("cart.rentalPeriod") }}</p>
            <p class="text-xs text-gray-400">
              {{ t("booking.selectRangeHint") }}
            </p>
          </div>

          <UChip
            v-if="blockedDateCount > 0"
            show
            inset
            color="error"
            size="2xs"
          >
            <span class="pl-2 text-xs">{{ t("booking.bookedLegend") }}</span>
          </UChip>
        </div>

        <UCalendar
          v-model="selectedRange"
          range
          :min-value="minDate"
          :is-date-disabled="isDateDisabled"
        >
          <template #day="{ day }">
            <UChip :show="isDateBooked(day)" inset color="error" size="2xs">
              {{ day.day }}
            </UChip>
          </template>
        </UCalendar>

        <p class="mt-2 text-xs text-gray-400">
          {{ t("booking.minDays", { min: minDays }) }}
          <span v-if="maxDays > 0">
            · {{ t("booking.maxDays", { max: maxDays }) }}
          </span>
        </p>
        <p
          v-if="selectionHitsBlockedDates"
          class="mt-1 text-xs font-medium text-error"
        >
          {{ t("booking.blockedRangeHint") }}
        </p>
      </div>

      <!-- Return date + cost summary -->
      <div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-900 space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-gray-500">{{ t("booking.startDate") }}</span>
          <span class="font-semibold">{{ formatDate(startDate) }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">{{ t("booking.returnDate") }}</span>
          <span class="font-semibold">{{ formatDate(returnDate) }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">{{ t("booking.numDays") }}</span>
          <span class="font-semibold">
            {{ numDays > 0 ? t("cart.days", { n: numDays }) : "—" }}
          </span>
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
