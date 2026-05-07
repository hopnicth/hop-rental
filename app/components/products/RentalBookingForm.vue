<script setup lang="ts">
import type { DateValue } from "@internationalized/date";
import { CalendarDate, today, getLocalTimeZone } from "@internationalized/date";
import type { ProductSKU } from "~/types/product";
import type { Asset } from "~/types/asset";
import {
  decomposeRentalDuration,
  type RentalPricingBreakdown,
  type RentalPricingLine,
} from "~/utils/rental-pricing";
import {
  canBypassBookingCutoff,
  formatCutoffTime,
  isPastDailyCutoff,
} from "~/utils/booking-cutoff";

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
    selectedSku?: ProductSKU;
    asset?: Asset | null;
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
const DEFAULT_SUPPORT_PHONE = "+66 95-479-2333";

type ContactSettingsDto = {
  supportPhone: string;
  lineUrl: string;
  updatedAt: string | null;
};

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
const toast = useToast();
const config = useRuntimeConfig();
const { blockingBookings } = useBooking();
const { profile } = useUserProfile();

const { data: contactSettings } = useFetch<ContactSettingsDto>(
  "/api/contact-settings",
  {
    key: "public-contact-settings",
    default: () => ({
      supportPhone: DEFAULT_SUPPORT_PHONE,
      lineUrl: "",
      updatedAt: null,
    }),
  },
);

const supportPhone = computed(() => {
  const value = String(
    contactSettings.value?.supportPhone ||
      config.public.chatSupportPhone ||
      DEFAULT_SUPPORT_PHONE,
  ).trim();
  return value.length > 0 ? value : DEFAULT_SUPPORT_PHONE;
});

const supportPhoneHref = computed(() =>
  supportPhone.value ? `tel:${supportPhone.value.replace(/\s+/g, "")}` : null,
);

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

// ── Config shortcuts ──
const minDays = computed(() => props.asset?.rentalRules.minDays ?? 1);
const maxDays = computed(() => props.asset?.rentalRules.maxDays ?? 365);
const bufferDays = computed(() => props.asset?.rentalRules.bufferDays ?? 0);

// ── Calendar state ──
const todayDate = today(getLocalTimeZone());

// ── Daily cutoff (Phase 1: global) ──
// After the configured cutoff time, same-day rentals are blocked unless the
// signed-in user has a bypass platform role (staff / super_admin).
const nowTick = ref(new Date());
let cutoffInterval: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  cutoffInterval = setInterval(() => {
    nowTick.value = new Date();
  }, 60_000);
});
onUnmounted(() => {
  if (cutoffInterval) clearInterval(cutoffInterval);
});

const canBypassCutoff = computed(() =>
  canBypassBookingCutoff(profile.value?.platformRole),
);
const isCutoffActive = computed(
  () => !canBypassCutoff.value && isPastDailyCutoff(nowTick.value),
);
const cutoffTimeLabel = computed(() => formatCutoffTime());

const minDate = computed(() => {
  const base = todayDate.add({ days: bufferDays.value });
  return isCutoffActive.value ? base.add({ days: 1 }) : base;
});

const selectedRange = shallowRef<CalendarRangeValue | undefined>(undefined);
const leadTimeAlertVisible = ref(false);
const rangeAdjustedReason = ref<"min" | "max" | null>(null);
const calendarRenderKey = ref(0);

const calendarRange = computed<CalendarRangeValue | undefined>({
  get: () => selectedRange.value,
  set: (range) => {
    if (range && isRangeBlockedByLeadTime(range)) {
      notifyLeadTimeBlocked();
      selectedRange.value = undefined;
      rangeAdjustedReason.value = null;
      return;
    }
    const normalized = normalizeRangeSelection(range);
    selectedRange.value = cloneRangeSelection(normalized.range);
    rangeAdjustedReason.value = normalized.reason;
  },
});

const relevantBookings = computed(() => {
  const skuId = props.selectedSku?.id;
  const assetId = props.asset?.id;

  if (!skuId && !assetId) return [];

  return blockingBookings.value.filter((booking) => {
    if (assetId) {
      return (
        booking.assetId === assetId ||
        (!!skuId && !booking.assetId && booking.skuId === skuId)
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
const leadTimeBlockedDateCount = computed(() =>
  diffCalendarDays(todayDate, minDate.value),
);

const hasLeadTimeRestriction = computed(
  () => leadTimeBlockedDateCount.value > 0,
);

// ── Derived values ──
const startDate = computed(() => selectedRange.value?.start);
const returnDate = computed(() => selectedRange.value?.end);

const numDays = computed(() => {
  if (!startDate.value || !returnDate.value) return 0;
  return diffCalendarDays(startDate.value, returnDate.value);
});

const dailyRate = computed(() => props.asset?.pricing.daily ?? 0);
const weeklyRate = computed(() => props.asset?.pricing.weekly ?? 0);
const monthlyRate = computed(() => props.asset?.pricing.monthly ?? 0);
const dailyEnabled = computed(() => props.asset?.pricing.dailyEnabled ?? true);
const weeklyEnabled = computed(
  () => props.asset?.pricing.weeklyEnabled ?? false,
);
const monthlyEnabled = computed(
  () => props.asset?.pricing.monthlyEnabled ?? false,
);
const currencyCode = computed(() => props.asset?.pricing.currencyCode ?? "THB");
const deposit = computed(() => props.asset?.pricing.deposit ?? 0);

const pricingBreakdown = computed<RentalPricingBreakdown>(() =>
  decomposeRentalDuration({
    days: numDays.value,
    dailyRate: dailyRate.value,
    dailyEnabled: dailyEnabled.value,
    weeklyRate: weeklyRate.value,
    weeklyEnabled: weeklyEnabled.value,
    monthlyRate: monthlyRate.value,
    monthlyEnabled: monthlyEnabled.value,
    currencyCode: currencyCode.value,
  }),
);

const totalCost = computed(() => pricingBreakdown.value.total);

const rangeAdjustedHint = computed(() => {
  if (rangeAdjustedReason.value === "min") {
    return t("booking.rangeAdjustedMin", { min: minDays.value });
  }
  if (rangeAdjustedReason.value === "max") {
    return t("booking.rangeAdjustedMax", { max: maxDays.value });
  }
  return null;
});

function unitLabel(line: RentalPricingLine): string {
  if (line.unit === "month") {
    return t("booking.unitMonths", { n: line.count });
  }
  if (line.unit === "week") {
    return t("booking.unitWeeks", { n: line.count });
  }
  return t("booking.unitDays", { n: line.count });
}

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

const selectionStartsBeforeMinDate = computed(() =>
  startDate.value
    ? isBeforeCalendarDate(startDate.value, minDate.value)
    : false,
);

const isBookerNameMissing = computed(() => !bookerName.value.trim());
const isBookerPhoneMissing = computed(() => !bookerPhone.value.trim());
const isBookerInfoMissing = computed(
  () => isBookerNameMissing.value || isBookerPhoneMissing.value,
);

const isRangeSelectionValid = computed(() => {
  if (!startDate.value || !returnDate.value) return false;
  if (selectionStartsBeforeMinDate.value) return false;
  if (numDays.value < minDays.value) return false;
  if (maxDays.value > 0 && numDays.value > maxDays.value) return false;
  if (selectionHitsBlockedDates.value) return false;
  return true;
});

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

function isBeforeCalendarDate(
  date: DateValue | CalendarDate,
  min: CalendarDate,
): boolean {
  return date.toDate("UTC").getTime() < min.toDate("UTC").getTime();
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

function isDateToday(date: DateValue | CalendarDate): boolean {
  return toISODateKey(date.toDate("UTC")) === toISO(todayDate);
}

function isDateInPast(date: DateValue | CalendarDate): boolean {
  return isBeforeCalendarDate(date, todayDate);
}

function isDateBlockedByLeadTime(date: DateValue | CalendarDate): boolean {
  return (
    !isBeforeCalendarDate(date, todayDate) &&
    isBeforeCalendarDate(date, minDate.value)
  );
}

function isRangeBlockedByLeadTime(range: CalendarRangeValue): boolean {
  return isDateBlockedByLeadTime(range.start);
}

function notifyLeadTimeBlocked(): void {
  leadTimeAlertVisible.value = true;
  toast.add({
    title: t("booking.urgentLeadTimeTitle"),
    description: t("booking.urgentLeadTimeDesc", { phone: supportPhone.value }),
    color: "warning",
    icon: "bx:phone-call",
  });
}

function dayChipColor(day: DateValue | CalendarDate): "error" | "warning" {
  return isDateBooked(day) ? "error" : "warning";
}

function showDayChip(day: DateValue | CalendarDate): boolean {
  return isDateBooked(day) || isDateBlockedByLeadTime(day);
}

function isDateDisabled(date: DateValue): boolean {
  return isDateBooked(date);
}

function normalizeRangeSelection(range: CalendarRangeValue | undefined): {
  range: CalendarRangeValue | undefined;
  reason: "min" | "max" | null;
} {
  if (!range?.start || !range.end) {
    return { range, reason: null };
  }

  const days = diffCalendarDays(range.start, range.end);
  if (days === 0) {
    return { range, reason: null };
  }

  if (days < minDays.value) {
    return {
      range: {
        start: range.start,
        end: range.start.add({ days: minDays.value }),
      },
      reason: "min",
    };
  }

  if (maxDays.value > 0 && days > maxDays.value) {
    return {
      range: {
        start: range.start,
        end: range.start.add({ days: maxDays.value }),
      },
      reason: "max",
    };
  }

  return { range, reason: null };
}

function cloneRangeSelection(
  range: CalendarRangeValue | undefined,
): CalendarRangeValue | undefined {
  if (!range?.start || !range.end) return range;
  return { start: range.start, end: range.end };
}

// ── Format CalendarDate → display string ──
function formatDate(d: CalendarDate | undefined): string {
  if (!d) return "—";
  return toISO(d);
}

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

  if (!isValid.value || !startDate.value || !returnDate.value) return;

  emit("submit", {
    startDate: toISO(startDate.value),
    numDays: numDays.value,
    returnDate: toISO(returnDate.value),
    totalCost: totalCost.value,
    deposit: deposit.value,
    dailyRate: dailyRate.value,
    weeklyRate: weeklyRate.value,
    monthlyRate: monthlyRate.value,
    pricingBreakdown: pricingBreakdown.value,
    bookerName: bookerName.value.trim(),
    bookerPhone: bookerPhone.value.trim(),
  });
}

watch([() => props.selectedSku?.id, () => props.asset?.id], () => {
  selectedRange.value = undefined;
  leadTimeAlertVisible.value = false;
  rangeAdjustedReason.value = null;
  submitAttempted.value = false;
});

const adjustedRangeRenderSignature = computed(() => {
  if (!rangeAdjustedReason.value || !startDate.value || !returnDate.value) {
    return null;
  }

  return [
    rangeAdjustedReason.value,
    toISO(startDate.value),
    toISO(returnDate.value),
    numDays.value,
  ].join(":");
});

watch(
  adjustedRangeRenderSignature,
  async (signature) => {
    if (!signature) return;
    await nextTick();
    calendarRenderKey.value += 1;
  },
  { flush: "post" },
);
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

      <!-- Calendar -->
      <div>
        <div class="mb-2 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p class="text-sm font-medium">{{ t("cart.rentalPeriod") }}</p>
            <p class="text-xs text-gray-400">
              {{ t("booking.selectRangeHint") }}
            </p>
          </div>

          <div
            class="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs"
          >
            <p class="font-medium text-muted">
              {{ t("booking.earliestStartLabel") }}
            </p>
            <p class="text-base font-semibold text-primary">
              {{ formatDate(minDate) }}
            </p>
            <p v-if="hasLeadTimeRestriction" class="mt-0.5 text-muted">
              {{
                t("booking.leadTimeRuleDesc", {
                  days: leadTimeBlockedDateCount,
                })
              }}
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
          <UChip
            v-if="leadTimeBlockedDateCount > 0"
            show
            inset
            color="warning"
            size="2xs"
          >
            <span class="pl-2 text-xs">{{ t("booking.leadTimeLegend") }}</span>
          </UChip>
        </div>

        <UCalendar
          :key="calendarRenderKey"
          v-model="calendarRange"
          range
          :min-value="minDate"
          :is-date-disabled="isDateDisabled"
        >
          <template #day="{ day }">
            <span
              class="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full transition"
              :class="{
                'opacity-25 grayscale': isDateInPast(day),
                'cursor-not-allowed text-warning opacity-60':
                  isDateBlockedByLeadTime(day),
                'ring-2 ring-primary/70 ring-offset-2 ring-offset-default dark:ring-offset-gray-950':
                  isDateToday(day),
              }"
            >
              <UChip
                :show="showDayChip(day)"
                inset
                :color="dayChipColor(day)"
                size="2xs"
              >
                {{ day.day }}
              </UChip>
            </span>
          </template>
        </UCalendar>

        <UAlert
          v-if="leadTimeAlertVisible"
          class="mt-3"
          color="warning"
          variant="soft"
          icon="bx:phone-call"
          :title="t('booking.urgentLeadTimeTitle')"
          :description="
            t('booking.urgentLeadTimeDesc', { phone: supportPhone })
          "
        >
          <template #actions>
            <UButton
              v-if="supportPhoneHref"
              size="sm"
              color="warning"
              variant="solid"
              icon="bx:phone-call"
              :href="supportPhoneHref"
              :label="t('booking.urgentLeadTimeCall')"
            />
          </template>
        </UAlert>

        <p class="mt-2 text-xs text-gray-400">
          {{ t("booking.minDays", { min: minDays }) }}
          <span v-if="maxDays > 0">
            · {{ t("booking.maxDays", { max: maxDays }) }}
          </span>
        </p>
        <p
          v-if="rangeAdjustedHint"
          class="mt-1 text-xs font-medium text-primary"
        >
          <UIcon name="bx:calendar-check" class="mr-1 inline" />
          {{ rangeAdjustedHint }}
        </p>
        <p v-if="isCutoffActive" class="mt-1 text-xs font-medium text-warning">
          <UIcon name="bx:time-five" class="mr-1 inline" />
          {{ t("booking.cutoffActiveBanner", { time: cutoffTimeLabel }) }}
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

        <div
          v-if="pricingBreakdown.lines.length > 0"
          class="space-y-1 border-t pt-2"
        >
          <p class="text-xs text-gray-500">
            {{ t("booking.priceBreakdownTitle") }}
          </p>
          <div
            v-for="line in pricingBreakdown.lines"
            :key="line.unit"
            class="flex justify-between"
          >
            <span class="text-gray-500">
              {{ unitLabel(line) }} × ฿{{ line.rate.toLocaleString() }}
            </span>
            <span class="font-semibold">
              ฿{{ line.subtotal.toLocaleString() }}
            </span>
          </div>
        </div>

        <div class="flex justify-between">
          <span class="text-gray-500">{{ t("productDetail.deposit") }}</span>
          <span class="font-semibold"> ฿{{ deposit.toLocaleString() }} </span>
        </div>
        <div class="flex justify-between border-t pt-2">
          <span class="text-gray-500">{{ t("booking.totalCost") }}</span>
          <span class="text-xl font-bold text-primary">
            ฿{{ totalCost.toLocaleString() }}
          </span>
        </div>
      </div>
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
