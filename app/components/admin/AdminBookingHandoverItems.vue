<script setup lang="ts">
import type { RentalBookingStatus } from "~/types/rental-booking";
import type {
  AdminBookingHandoverItem,
  AdminBookingHandoverItemsResponse,
  GenerateBookingHandoverItemsResponse,
} from "~/types/admin-booking-handover-items";

const props = defineProps<{
  bookingId: string;
  bookingStatus: RentalBookingStatus;
}>();

const toast = useToast();
const items = ref<AdminBookingHandoverItem[]>([]);
const loading = ref(false);
const busy = ref(false);
const showForm = ref(false);
const editingId = ref<string | null>(null);
const form = reactive({
  itemName: "",
  quantityPrepared: 1,
  preparationNote: "",
});

const formTitle = computed(() =>
  editingId.value ? "แก้ไขรายการเตรียมส่งมอบ" : "เพิ่มรายการเตรียมส่งมอบ",
);

const editable = computed(
  () => !["picked_up", "returned", "cancelled"].includes(props.bookingStatus),
);

function resetForm() {
  editingId.value = null;
  form.itemName = "";
  form.quantityPrepared = 1;
  form.preparationNote = "";
}

function openCreate() {
  resetForm();
  showForm.value = true;
}

function openEdit(item: AdminBookingHandoverItem) {
  editingId.value = item.id;
  form.itemName = item.itemName;
  form.quantityPrepared = item.quantityPrepared;
  form.preparationNote = item.preparationNote ?? "";
  showForm.value = true;
}

async function loadItems() {
  if (!props.bookingId) return;
  loading.value = true;
  try {
    const res = await $fetch<AdminBookingHandoverItemsResponse>(
      `/api/admin/rental-bookings/${props.bookingId}/handover-items`,
    );
    items.value = res.items;
  } catch (e) {
    toast.add({
      title: "โหลดรายการส่งมอบไม่สำเร็จ",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    loading.value = false;
  }
}

async function generateFromBooking() {
  busy.value = true;
  try {
    const res = await $fetch<GenerateBookingHandoverItemsResponse>(
      `/api/admin/rental-bookings/${props.bookingId}/handover-items/generate`,
      { method: "POST" },
    );
    items.value = res.items;
    toast.add({
      title:
        res.status === "created"
          ? "สร้างรายการตั้งต้นแล้ว"
          : "มีรายการเตรียมส่งมอบอยู่แล้ว",
      color: res.status === "created" ? "success" : "info",
    });
  } catch (e) {
    toast.add({
      title: "สร้างรายการตั้งต้นไม่สำเร็จ",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    busy.value = false;
  }
}

async function submitForm() {
  busy.value = true;
  try {
    const body = {
      itemName: form.itemName.trim(),
      quantityPrepared: Number(form.quantityPrepared),
      preparationNote: form.preparationNote.trim() || null,
    };
    const path = editingId.value
      ? `/api/admin/rental-bookings/${props.bookingId}/handover-items/${editingId.value}`
      : `/api/admin/rental-bookings/${props.bookingId}/handover-items`;
    const res = await $fetch<AdminBookingHandoverItemsResponse>(path, {
      method: editingId.value ? "PATCH" : "POST",
      body,
    });
    items.value = res.items;
    showForm.value = false;
    resetForm();
    toast.add({ title: "บันทึกรายการแล้ว", color: "success" });
  } catch (e) {
    toast.add({
      title: "บันทึกรายการไม่สำเร็จ",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    busy.value = false;
  }
}

async function deleteItem(item: AdminBookingHandoverItem) {
  if (!confirm(`Delete handover item "${item.itemName}"?`)) return;
  busy.value = true;
  try {
    const res = await $fetch<AdminBookingHandoverItemsResponse>(
      `/api/admin/rental-bookings/${props.bookingId}/handover-items/${item.id}`,
      { method: "DELETE" },
    );
    items.value = res.items;
    toast.add({ title: "ลบรายการแล้ว", color: "success" });
  } catch (e) {
    toast.add({
      title: "ลบรายการไม่สำเร็จ",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    busy.value = false;
  }
}

function returnLabel(status: string) {
  return status.replace("returned_", "").replace("_", " ");
}

watch(
  () => props.bookingId,
  () => void loadItems(),
  { immediate: true },
);
</script>

<template>
  <UCard>
    <template #header>
      <div
        class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h3 class="font-semibold">รายการสินค้า / อุปกรณ์ที่ส่งมอบ</h3>
          <p class="text-sm text-muted">
            รายการที่เตรียมส่งมอบให้ลูกค้า — ตรวจสอบก่อนส่งมอบจริง
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton
            size="xs"
            variant="soft"
            icon="bx:refresh"
            :loading="loading"
            @click="loadItems"
            >Refresh</UButton
          >
          <UButton
            size="xs"
            variant="soft"
            color="primary"
            icon="bx:package"
            :disabled="!editable"
            :loading="busy"
            @click="generateFromBooking"
            >สร้างรายการตั้งต้นจากสินค้าที่จอง</UButton
          >
          <UButton
            size="xs"
            color="primary"
            icon="bx:plus"
            :disabled="!editable"
            :loading="busy"
            @click="openCreate"
            >เพิ่มรายการ</UButton
          >
        </div>
      </div>
    </template>

    <UAlert
      v-if="!editable"
      class="mb-3"
      color="warning"
      variant="soft"
      title="รายการถูกล็อกหลังเริ่มกระบวนการส่งมอบหรือปิดงานแล้ว"
      description="Phase 1 อนุญาตให้เตรียมรายการได้เฉพาะก่อน pickup เท่านั้น"
    />

    <div v-if="loading" class="py-6 text-center text-sm text-muted">
      Loading handover items…
    </div>
    <div
      v-else-if="items.length === 0"
      class="rounded-xl border border-dashed border-default p-4 text-sm text-muted"
    >
      ยังไม่มีรายการเตรียมส่งมอบ Staff สามารถสร้างรายการตั้งต้นจาก Booking
      หรือเพิ่มรายการเองก่อน pickup
    </div>
    <div v-else class="overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-default text-xs uppercase text-muted">
          <tr>
            <th class="py-2 pr-3">รายการ / Item</th>
            <th class="py-2 pr-3 text-right">จำนวนเตรียม</th>
            <th class="py-2 pr-3">หมายเหตุ</th>
            <th class="py-2 pr-3">Pickup</th>
            <th class="py-2 pr-3">Return</th>
            <th class="py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in items"
            :key="item.id"
            class="border-b border-default/50 last:border-b-0"
          >
            <td class="py-3 pr-3">
              <p class="font-medium">{{ item.itemName }}</p>
              <p v-if="item.assetId" class="text-xs text-muted">
                Asset: {{ item.assetId }}
              </p>
            </td>
            <td class="py-3 pr-3 text-right">{{ item.quantityPrepared }}</td>
            <td class="py-3 pr-3 text-muted">
              {{ item.preparationNote || "—" }}
            </td>
            <td class="py-3 pr-3">
              <UBadge
                :color="item.pickupChecked ? 'success' : 'neutral'"
                variant="soft"
                size="xs"
              >
                {{ item.pickupChecked ? "checked" : "pending" }}
              </UBadge>
            </td>
            <td class="py-3 pr-3">
              <UBadge
                :color="item.returnStatus === 'pending' ? 'neutral' : 'info'"
                variant="soft"
                size="xs"
              >
                {{ returnLabel(item.returnStatus) }}
              </UBadge>
            </td>
            <td class="py-3 text-right">
              <div class="flex justify-end gap-1">
                <UButton
                  size="xs"
                  variant="ghost"
                  icon="bx:edit"
                  :disabled="!editable || busy"
                  @click="openEdit(item)"
                />
                <UButton
                  size="xs"
                  variant="ghost"
                  color="error"
                  icon="bx:trash"
                  :disabled="!editable || busy"
                  @click="deleteItem(item)"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <UModal v-model:open="showForm" :title="formTitle">
      <template #body>
        <div class="space-y-3">
          <UFormField label="ชื่อรายการ" required>
            <UInput
              v-model="form.itemName"
              class="w-full"
              placeholder="เช่น สว่าน, ดอกสว่าน, แบตเตอรี่"
            />
          </UFormField>

          <UFormField label="จำนวนที่เตรียม" required>
            <UInput
              v-model.number="form.quantityPrepared"
              class="w-full"
              type="number"
              min="0.01"
              step="0.01"
            />
          </UFormField>

          <UFormField label="หมายเหตุ">
            <UTextarea
              v-model="form.preparationNote"
              class="w-full"
              :rows="2"
              placeholder="เช่น ขนาด 6 mm / ใช้คู่กับชุดหลัก"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="busy"
            @click="showForm = false"
            >ยกเลิก</UButton
          >
          <UButton
            color="primary"
            :loading="busy"
            :disabled="!form.itemName.trim() || form.quantityPrepared <= 0"
            @click="submitForm"
            >บันทึกรายการ</UButton
          >
        </div>
      </template>
    </UModal>
  </UCard>
</template>
