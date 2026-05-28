<script setup lang="ts">
import FeatureBtn from "./FeatureBtn.vue";

const { t } = useI18n();
const { cartItemCount, cartId } = useCart();
const { activeBookings, blockingBookings } = useBooking();
const toast = useToast();
const router = useRouter();
const config = useRuntimeConfig();

const chatSupportPhone = computed(() =>
  String(config.public.chatSupportPhone || ""),
);

const availablePaths = computed(
  () => new Set(router.getRoutes().map((route) => route.path)),
);

const quotationBadgeCount = computed(
  () => cartItemCount.value + activeBookings.value.length,
);

const rentalListBadgeCount = computed(() => blockingBookings.value.length);

const hasOrdersRoute = computed(() => availablePaths.value.has("/user/orders"));

const hasRentalsRoute = computed(() =>
  availablePaths.value.has("/user/rentals"),
);

/**
 * Call support/sales phone from runtime config.
 */
function handleContactSales() {
  const phoneHref = chatSupportPhone.value.replace(/[^\d+]/g, "");

  if (!phoneHref) {
    toast.add({
      title: t("featureBar.contactSales"),
      description: "ยังไม่ได้ตั้งค่าเบอร์โทรฝ่ายบริการ",
      icon: "streamline-cyber:phone-5",
      color: "warning",
    });
    return;
  }

  console.log("[QuotationBar] Contact support call:", {
    cartId: cartId.value,
    phone: chatSupportPhone.value,
  });

  window.location.href = `tel:${phoneHref}`;
}
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- 1. Cart — shows badge with item count -->
    <FeatureBtn
      icon="streamline-cyber:shopping-cart-3"
      :label="t('featureBar.cart')"
      :badge="quotationBadgeCount"
      to="/user/cart"
    />

    <!-- 2. Order History -->
    <FeatureBtn
      v-if="hasOrdersRoute"
      icon="streamline-cyber:clock-1"
      :label="t('featureBar.orderHistory')"
      to="/user/orders"
    />

    <!-- 3. Rental List — shows badge with confirmed + picked-up bookings -->
    <FeatureBtn
      v-if="hasRentalsRoute"
      icon="streamline-cyber:heart-calendar"
      :label="t('featureBar.rentalList')"
      :badge="rentalListBadgeCount"
      to="/user/rentals"
    />

    <!-- 4. Contact Sales — calls support phone -->
    <FeatureBtn
      icon="streamline-cyber:phone-5"
      :label="t('featureBar.contactSales')"
      @click="handleContactSales"
    />
  </div>
</template>
