<script setup lang="ts">
interface PosCatalogSuggestionItem {
  key: string;
  productName: string;
  skuName: string;
  code: string;
  imageUrl: string | null;
  stock: number;
  price: number;
}

const props = defineProps<{
  modelValue: string;
  mode: "rental" | "sale";
  loading?: boolean;
  suggestions?: PosCatalogSuggestionItem[];
  suggestionsOpen?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  searchInput: [];
  focusInput: [];
  blurInput: [];
  submit: [];
  scan: [];
  selectSuggestion: [key: string];
}>();

const PRODUCT_IMAGE_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' rx='24' fill='%23f1f5f9'/%3E%3Cpath d='M40 112h80L98 84 82 101 68 72z' fill='%23cbd5e1'/%3E%3Ccircle cx='104' cy='54' r='12' fill='%23cbd5e1'/%3E%3C/svg%3E";

const searchValue = computed({
  get: () => props.modelValue,
  set: (value: string) => emit("update:modelValue", value),
});

function formatCurrency(value: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
  }).format(value);
}

function imageSrc(value?: string | null) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || PRODUCT_IMAGE_PLACEHOLDER;
}
</script>

<template>
  <div class="flex gap-2">
    <div class="relative min-w-0 flex-1">
      <UInput
        v-model="searchValue"
        icon="bx:search"
        class="w-full"
        :placeholder="
          mode === 'sale'
            ? 'พิมพ์ชื่อสินค้า / SKU / Barcode เพื่อเพิ่มลงตะกร้า'
            : 'ค้นหา Asset / รหัสทรัพย์สิน'
        "
        @input="emit('searchInput')"
        @focus="emit('focusInput')"
        @blur="emit('blurInput')"
        @keyup.enter="emit('submit')"
      />
      <div
        v-if="mode === 'sale' && suggestionsOpen && suggestions?.length"
        class="absolute z-30 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-secondary/50 bg-default p-2 shadow-xl ring-1 ring-secondary/20"
      >
        <button
          v-for="option in suggestions"
          :key="option.key"
          type="button"
          class="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-secondary/10 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="option.stock <= 0"
          @mousedown.prevent="emit('selectSuggestion', option.key)"
        >
          <img :src="imageSrc(option.imageUrl)" alt="" class="h-12 w-12 rounded-lg border object-cover" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">
              {{ option.productName }} · {{ option.skuName }}
            </span>
            <span class="block truncate text-xs text-muted">
              {{ option.code }} · {{ formatCurrency(option.price) }}
            </span>
          </span>
          <UBadge :color="option.stock > 0 ? 'success' : 'error'" variant="soft">
            Stock {{ option.stock }}
          </UBadge>
        </button>
      </div>
    </div>
    <UButton :loading="loading" icon="bx:refresh" label="ค้นหา" @click="emit('submit')" />
    <UButton icon="bx:barcode-reader" variant="soft" label="สแกน" @click="emit('scan')" />
  </div>
</template>