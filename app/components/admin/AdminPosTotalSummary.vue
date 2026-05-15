<script setup lang="ts">
import type {
  RentalPaymentLine,
  RentalPaymentLineSummary,
} from "~/types/rental-payment-line";

withDefaults(
  defineProps<{
    mode: "rental" | "sale";
    rentalDays: number;
    rentalSubtotal: number | null;
    rentalCheckoutTotal: number;
    defaultDepositAmount: number;
    currentDepositAmount: number;
    isDepositAdjusted?: boolean;
    paymentLines?: RentalPaymentLine[];
    paymentSummary?: RentalPaymentLineSummary | null;
    saleCartCount: number;
    saleCartTotal: number;
  }>(),
  {
    paymentLines: () => [],
    paymentSummary: null,
  },
);

function formatCurrency(value: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
  }).format(value);
}

function formatRate(value: number) {
  return `${(Number(value || 0) * 100).toFixed(value > 0 ? 0 : 0)}%`;
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="mode === 'rental'">
      <p class="text-sm font-medium">ราคาเช่าอัตโนมัติ</p>
      <p class="text-xs text-muted">
        ใช้ logic tier day/week/month เดียวกับหน้าจองของลูกค้า
      </p>
    </div>
    <div v-else>
      <p class="text-sm font-medium">สรุปยอดขายขาด</p>
      <p class="text-xs text-muted">
        ตะกร้า {{ saleCartCount }} รายการ · ต้องรับชำระครบก่อนตัด Stock
      </p>
    </div>

    <div v-if="mode === 'rental'" class="space-y-1 text-sm">
      <div class="flex justify-between">
        <span class="text-muted">จำนวนวัน</span
        ><span class="font-medium">{{ rentalDays || "—" }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted">ยอดค่าเช่า</span
        ><span class="font-semibold">{{
          rentalSubtotal == null ? "—" : formatCurrency(rentalSubtotal)
        }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted">มัดจำตาม Asset</span
        ><span class="font-semibold">{{
          formatCurrency(defaultDepositAmount)
        }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted">เงินมัดจำจองที่ต้องชำระตอนนี้</span>
        <span class="font-semibold text-primary">{{
          formatCurrency(paymentSummary?.bookingDepositDueNow ?? 0)
        }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted">มัดจำคงเหลือชำระวันรับสินค้า</span>
        <span class="font-semibold">{{
          formatCurrency(
            paymentSummary?.remainingSecurityDepositDueAtPickup ??
              defaultDepositAmount,
          )
        }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted">ยอดรวมค่าเช่า + มัดจำทั้งหมด</span
        ><span class="font-semibold">{{
          formatCurrency(rentalCheckoutTotal)
        }}</span>
      </div>
      <div
        v-if="paymentLines.length"
        class="mt-3 rounded-lg border border-default p-2"
      >
        <p class="mb-2 text-xs font-medium text-muted">Payment lines / WHT</p>
        <div
          v-for="line in paymentLines"
          :key="line.lineType"
          class="space-y-1 border-t border-default py-2 first:border-t-0 first:pt-0"
        >
          <div class="flex justify-between gap-2">
            <span class="font-medium">{{ line.descriptionTh }}</span>
            <span>{{ formatCurrency(line.grossAmount) }}</span>
          </div>
          <div class="flex justify-between text-xs text-muted">
            <span>WHT {{ formatRate(line.whtRate) }}</span>
            <span>-{{ formatCurrency(line.whtAmount) }}</span>
          </div>
          <div class="flex justify-between text-xs font-medium">
            <span>Net payable</span>
            <span>{{ formatCurrency(line.netPayableAmount) }}</span>
          </div>
        </div>
        <div class="mt-2 border-t border-default pt-2 text-xs">
          <div class="flex justify-between">
            <span class="text-muted">Gross</span>
            <span>{{ formatCurrency(paymentSummary?.grossTotal ?? 0) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">Total WHT</span>
            <span>-{{ formatCurrency(paymentSummary?.whtTotal ?? 0) }}</span>
          </div>
          <div class="flex justify-between font-semibold">
            <span>ยอดสุทธิรวม</span>
            <span>{{
              formatCurrency(paymentSummary?.netPayableTotal ?? 0)
            }}</span>
          </div>
          <div class="flex justify-between font-semibold text-primary">
            <span>ชำระตอนนี้ (Booking Deposit)</span>
            <span>{{
              formatCurrency(paymentSummary?.netPayableNow ?? 0)
            }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">ชำระวันรับสินค้า</span>
            <span>{{
              formatCurrency(paymentSummary?.netPayableAtPickup ?? 0)
            }}</span>
          </div>
        </div>
      </div>
      <UAlert
        v-if="isDepositAdjusted"
        color="warning"
        variant="soft"
        title="มีการปรับยอดมัดจำด้วยตนเอง"
        :description="`${formatCurrency(defaultDepositAmount)} → ${formatCurrency(currentDepositAmount)}`"
      />
    </div>

    <div
      v-else
      class="rounded-lg border border-secondary/50 bg-secondary/5 p-3 text-sm"
    >
      <div class="flex justify-between font-semibold">
        <span>ยอดขายรวม</span>
        <span>{{ formatCurrency(saleCartTotal) }}</span>
      </div>
    </div>
  </div>
</template>
