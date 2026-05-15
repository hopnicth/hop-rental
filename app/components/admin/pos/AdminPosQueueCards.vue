<script setup lang="ts">
const cards = [
  { key: "pickups", title: "Today's pickups", value: "—", note: "Queue UI reserved for Phase 4 pickup workflow." },
  { key: "returns", title: "Today's returns", value: "—", note: "Queue UI reserved for Phase 5 return workflow." },
  { key: "active", title: "Active rentals", value: "—", note: "Lookup and active-rental board will be connected in later phases." },
  { key: "overdue", title: "Overdue follow-up", value: "—", note: "Operational follow-up card placeholder only in this shell phase." },
  { key: "kyc", title: "KYC incomplete", value: "—", note: "Will surface bookings blocked by missing ID / KYC in a later phase." },
];
</script>

<template>
  <UCard>
    <template #header>
      <div>
        <h2 class="text-lg font-semibold">Queue cards</h2>
        <p class="text-sm text-muted">
          Phase 1 keeps the layout visible while data-backed queue logic is added later.
        </p>
      </div>
    </template>

    <div class="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
      <UCard v-for="card in cards" :key="card.key" variant="subtle">
        <div class="space-y-2">
          <div class="flex items-center justify-between gap-3">
            <p class="font-medium text-default">{{ card.title }}</p>
            <UBadge color="neutral" variant="soft">{{ card.value }}</UBadge>
          </div>
          <p class="text-sm text-muted">{{ card.note }}</p>
        </div>
      </UCard>
    </div>
  </UCard>
</template>