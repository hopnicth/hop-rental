<script setup lang="ts">
const props = defineProps<{
  mode: "rental" | "sale";
  rentalDays: number;
  rentalSubtotal: number | null;
  rentalCheckoutTotal: number;
  defaultDepositAmount: number;
  currentDepositAmount: number;
  isDepositAdjusted?: boolean;
  saleCartCount: number;
  saleCartTotal: number;
}>();

function formatCurrency(value: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
  }).format(value);
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="mode === 'rental'">
      <p class="text-sm font-medium">ราคาเช่าอัตโนมัติ</p>
      <p class="text-xs text-muted">ใช้ logic tier day/week/month เดียวกับหน้าจองของลูกค้า</p>
    </div>
    <div v-else>
      <p class="text-sm font-medium">สรุปยอดขายขาด</p>
      <p class="text-xs text-muted">ตะกร้า {{ saleCartCount }} รายการ · ต้องรับชำระครบก่อนตัด Stock</p>
    </div>

    <div v-if="mode === 'rental'" class="space-y-1 text-sm">
      <div class="flex justify-between"><span class="text-muted">จำนวนวัน</span><span class="font-medium">{{ rentalDays || '—' }}</span></div>
      <div class="flex justify-between"><span class="text-muted">ยอดค่าเช่า</span><span class="font-semibold">{{ rentalSubtotal == null ? '—' : formatCurrency(rentalSubtotal) }}</span></div>
      <div class="flex justify-between"><span class="text-muted">มัดจำตาม Asset</span><span class="font-semibold">{{ formatCurrency(defaultDepositAmount) }}</span></div>
      <div class="flex justify-between"><span class="text-muted">ยอดรวมรับชำระ</span><span class="font-semibold">{{ formatCurrency(rentalCheckoutTotal) }}</span></div>
      <UAlert
        v-if="isDepositAdjusted"
        color="warning"
        variant="soft"
        title="มีการปรับยอดมัดจำด้วยตนเอง"
        :description="`${formatCurrency(defaultDepositAmount)} → ${formatCurrency(currentDepositAmount)}`"
      />
    </div>

    <div v-else class="rounded-lg border border-secondary/50 bg-secondary/5 p-3 text-sm">
      <div class="flex justify-between font-semibold">
        <span>ยอดขายรวม</span>
        <span>{{ formatCurrency(saleCartTotal) }}</span>
      </div>
    </div>
  </div>
</template>