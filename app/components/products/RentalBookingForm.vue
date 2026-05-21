<script setup lang="ts">
import type { ProductSKU } from "~/types/product";
import type { Asset } from "~/types/asset";
import type { RentalPricingBreakdown } from "~/utils/rental-pricing";

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

interface RentalBookingCalendarPayload {
  startDate: string;
  numDays: number;
  returnDate: string;
  totalCost: number;
  deposit: number;
  dailyRate: number;
  weeklyRate: number;
  monthlyRate: number;
  pricingBreakdown: RentalPricingBreakdown;
  isValid: boolean;
}

interface RentalCalendarBlockingBooking {
  bookingId?: string;
  skuId?: string;
  assetId?: string;
  startDate: string;
  exclusiveEndDate?: string;
  returnDate: string;
  status?: string;
}

const props = withDefaults(
  defineProps<{
    selectedSku?: ProductSKU;
    asset?: Asset | null;
    loading?: boolean;
    blockingBookings?: RentalCalendarBlockingBooking[] | null;
  }>(),
  {
    selectedSku: undefined,
    asset: null,
    loading: false,
    blockingBookings: null,
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
      dailyRate: number;
      weeklyRate: number;
      monthlyRate: number;
      pricingBreakdown: RentalPricingBreakdown;
      bookerName: string;
      bookerPhone: string;
    },
  ];
  cancel: [];
}>();

const { t } = useI18n();
const { profile } = useUserProfile();

// ── Booker contact fields ──
const bookerName = ref("");
const bookerPhone = ref("");
const contactFieldsRef = ref<HTMLElement | null>(null);
const submitAttempted = ref(false);

// Pre-fill from user profile when available
watch(
  () => profile.value,
  (p) => {
    if (p && !bookerName.value) {
      bookerName.value = p.fullName ?? "";
    }
    if (p && !bookerPhone.value) {
      bookerPhone.value = p.phone ?? "";
    }
  },
  { immediate: true },
);

const emptyCalendarPayload = (): RentalBookingCalendarPayload => ({
  startDate: "",
  numDays: 0,
  returnDate: "",
  totalCost: 0,
  deposit: 0,
  dailyRate: 0,
  weeklyRate: 0,
  monthlyRate: 0,
  pricingBreakdown: {
    totalDays: 0,
    currencyCode: props.asset?.pricing.currencyCode ?? "THB",
    lines: [],
    total: 0,
  },
  isValid: false,
});

const calendarPayload = ref<RentalBookingCalendarPayload>(
  emptyCalendarPayload(),
);

function handleCalendarChange(payload: RentalBookingCalendarPayload): void {
  calendarPayload.value = payload;
}

const isBookerNameMissing = computed(() => !bookerName.value.trim());
const isBookerPhoneMissing = computed(() => !bookerPhone.value.trim());
const isBookerInfoMissing = computed(
  () => isBookerNameMissing.value || isBookerPhoneMissing.value,
);

const isRangeSelectionValid = computed(() => calendarPayload.value.isValid);

const submitValidationMessage = computed(() => {
  if (!submitAttempted.value || !isBookerInfoMissing.value) return null;
  return t("booking.bookerInfoRequired");
});

// ── Validation ──
const isValid = computed(() => {
  if (!isRangeSelectionValid.value) return false;
  if (isBookerInfoMissing.value) return false;
  return true;
});

function scrollToBookerFields(): void {
  contactFieldsRef.value?.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });

  const targetId = isBookerNameMissing.value
    ? "booking-booker-name"
    : isBookerPhoneMissing.value
      ? "booking-booker-phone"
      : null;

  if (!targetId || typeof document === "undefined") return;

  requestAnimationFrame(() => {
    const input = document.getElementById(targetId) as HTMLInputElement | null;
    input?.focus();
  });
}

// ── Submit ──
function handleSubmit() {
  if (props.loading) return;

  submitAttempted.value = true;

  if (isBookerInfoMissing.value) {
    scrollToBookerFields();
    return;
  }

  const booking = calendarPayload.value;
  if (!isValid.value || !booking.startDate || !booking.returnDate) return;

  emit("submit", {
    startDate: booking.startDate,
    numDays: booking.numDays,
    returnDate: booking.returnDate,
    totalCost: booking.totalCost,
    deposit: booking.deposit,
    dailyRate: booking.dailyRate,
    weeklyRate: booking.weeklyRate,
    monthlyRate: booking.monthlyRate,
    pricingBreakdown: booking.pricingBreakdown,
    bookerName: bookerName.value.trim(),
    bookerPhone: bookerPhone.value.trim(),
  });
}

watch([() => props.selectedSku?.id, () => props.asset?.id], () => {
  calendarPayload.value = emptyCalendarPayload();
  submitAttempted.value = false;
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
      <!-- Booker contact info -->
      <div
        ref="contactFieldsRef"
        class="grid gap-3 scroll-mt-24 sm:grid-cols-2"
      >
        <UFormField :label="t('booking.bookerName')" required>
          <UInput
            id="booking-booker-name"
            v-model="bookerName"
            :placeholder="t('booking.bookerNamePlaceholder')"
            icon="bx:user"
          />
        </UFormField>
        <UFormField :label="t('booking.bookerPhone')" required>
          <UInput
            id="booking-booker-phone"
            v-model="bookerPhone"
            type="tel"
            :placeholder="t('booking.bookerPhonePlaceholder')"
            icon="bx:phone"
          />
        </UFormField>
      </div>

      <ProductsRentalBookingCalendar
        :selected-sku="props.selectedSku"
        :asset="props.asset"
        :blocking-bookings="props.blockingBookings"
        :loading="props.loading"
        @change="handleCalendarChange"
      />
    </div>

    <template #footer>
      <div class="space-y-2">
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
            :disabled="props.loading || !isRangeSelectionValid"
            @click="handleSubmit"
          />
        </div>
        <p
          v-if="submitValidationMessage"
          class="text-right text-sm font-medium text-error"
          aria-live="polite"
        >
          {{ submitValidationMessage }}
        </p>
      </div>
    </template>
  </UCard>
</template>
