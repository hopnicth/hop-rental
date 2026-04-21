<script setup lang="ts">
import FeatureBtn from "./FeatureBtn.vue";
const { t } = useI18n();
const { cartItemCount, cartId } = useCart();
const { activeBookings } = useBooking();
const toast = useToast();
const router = useRouter();
const availablePaths = computed(
  () => new Set(router.getRoutes().map((route) => route.path)),
);
const quotationBadgeCount = computed(
  () => cartItemCount.value + activeBookings.value.length,
);
const hasOrdersRoute = computed(() => availablePaths.value.has("/user/orders"));

/**
 * Show Cart ID to customer so they can share it with the sales team.
 */
function handleContactSales() {
  toast.add({
    title: t("featureBar.cartId"),
    description: t("featureBar.cartIdMessage", { cartId: cartId.value }),
    icon: "streamline-cyber:phone-5",
    color: "info",
  });

  console.log("[QuotationBar] Cart ID:", cartId.value);
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

    <!-- 3. Contact Sales — shows cart ID in toast -->
    <FeatureBtn
      icon="streamline-cyber:phone-5"
      :label="t('featureBar.contactSales')"
      @click="handleContactSales"
    />
  </div>
</template>
