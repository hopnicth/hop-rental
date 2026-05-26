<script setup lang="ts">
type FooterLink = {
  key: string;
  to?: string;
  href?: string;
  external?: boolean;
  action?: "cookiePreferences";
};

type FooterSection = {
  id: "hopnic" | "customerService" | "rentalTerms" | "contact";
  title: string;
  kind: "links" | "contact";
  links?: FooterLink[];
};

const { t } = useI18n();
const cookieConsent = useCookieConsent();

const openSections = ref<Record<FooterSection["id"], boolean>>({
  hopnic: false,
  customerService: false,
  rentalTerms: false,
  contact: false,
});

const footerSections = computed<FooterSection[]>(() => [
  {
    id: "hopnic",
    title: t("footer.sections.hopnic"),
    kind: "links",
    links: [
      { key: "home", to: "/" },
      { key: "products", to: "/product-all" },
      { key: "rentals", to: "/product-rental" },
      { key: "partners", to: "/partners" },
      // TODO: Wire this to the planned public About Us route once it exists.
      { key: "about" },
      { key: "contact", href: "#footer-contact" },
    ],
  },
  {
    id: "customerService",
    title: t("footer.sections.customerService"),
    kind: "links",
    links: [
      // TODO: Add a public how-to-order page and link it here.
      { key: "howToOrder" },
      // TODO: Add a public equipment rental guide page and link it here.
      { key: "howToRent" },
      // TODO: Add a public payment information page and link it here.
      { key: "payment" },
      // TODO: Add a public delivery / returns information page and link it here.
      { key: "deliveryReturn" },
      // TODO: Add a public FAQ page and link it here.
      { key: "faq" },
      { key: "customerSupport", href: "#footer-contact" },
    ],
  },
  {
    id: "rentalTerms",
    title: t("footer.sections.rentalTerms"),
    kind: "links",
    links: [
      // TODO: Link to the future deposit / refund policy route.
      { key: "depositRefund" },
      // TODO: Link to the future booking cancellation policy route.
      { key: "cancellation" },
      // TODO: Link to the future public rental agreement route.
      { key: "rentalAgreement" },
      // TODO: Link to the future damage / fees policy route.
      { key: "damageFees" },
      // TODO: Link to the future damage protection / insurance route.
      { key: "damageProtection" },
    ],
  },
  {
    id: "contact",
    title: t("footer.sections.contact"),
    kind: "contact",
  },
]);

const contactDetails = computed(() => [
  {
    key: "registrationNumber",
    label: t("footer.contact.registrationNumberLabel"),
    value: t("footer.contact.registrationNumber"),
  },
  {
    key: "phone",
    label: t("footer.contact.phoneLabel"),
    value: t("footer.contact.phone"),
    href: "tel:0954792333",
  },
  {
    key: "email",
    label: t("footer.contact.emailLabel"),
    value: t("footer.contact.email"),
    href: "mailto:info@hopnic.co.th",
  },
  {
    key: "line",
    label: t("footer.contact.lineLabel"),
    value: t("footer.contact.lineId"),
    href: "https://line.me/R/ti/p/@832vmicv?ts=03031436&oat_content=url",
    external: true,
  },
  {
    key: "hours",
    label: t("footer.contact.businessHoursLabel"),
    value: t("footer.contact.businessHours"),
  },
]);

const contactCtas = computed(() => [
  {
    key: "map",
    label: t("footer.cta.map"),
    compactLabel: t("footer.ctaCompact.map"),
    href: "https://www.google.com/maps/place/%E0%B8%9A%E0%B8%A3%E0%B8%B4%E0%B8%A9%E0%B8%B1%E0%B8%97+%E0%B8%AE%E0%B8%AD%E0%B8%9B%E0%B8%99%E0%B8%B4%E0%B8%84+%E0%B8%88%E0%B8%B3%E0%B8%81%E0%B8%B1%E0%B8%94/data=!4m2!3m1!1s0x0:0x75a0753fcaba8fc4?sa=X&ved=1t:2428&ictx=111",
    icon: "bx:map",
    external: true,
    mobileClass: "order-3 md:order-none",
  },
  {
    key: "line",
    label: t("footer.cta.line"),
    compactLabel: t("footer.ctaCompact.line"),
    href: "https://line.me/R/ti/p/@832vmicv?ts=03031436&oat_content=url",
    icon: "ri:line-fill",
    external: true,
    mobileClass: "order-1 md:order-none",
  },
  {
    key: "call",
    label: t("footer.cta.call"),
    compactLabel: t("footer.ctaCompact.call"),
    href: "tel:0954792333",
    icon: "bx:phone-call",
    mobileClass: "order-2 md:order-none",
  },
]);

const legalLinks = computed<FooterLink[]>(() => [
  // TODO: Link to the future public privacy policy route.
  { key: "privacy" },
  // TODO: Link to the future website terms route.
  { key: "terms" },
  // TODO: Link to the future public rental agreement route.
  { key: "rentalAgreement" },
  // TODO: Link to the future cancellation / refund policy route.
  { key: "refundCancellation" },
  // TODO: Replace this with a dedicated cookie policy route when available.
  { key: "cookies", action: "cookiePreferences" },
]);

function isOpen(id: FooterSection["id"]) {
  return openSections.value[id];
}

function toggleSection(id: FooterSection["id"]) {
  openSections.value[id] = !openSections.value[id];
}

function onLegalAction(action?: FooterLink["action"]) {
  if (action === "cookiePreferences") cookieConsent.openPreferences();
}
</script>

<template>
  <footer class="app-footer mt-8 border-t border-black/5 md:mt-16">
    <UContainer class="py-5 md:py-12">
      <div
        class="grid gap-2.5 md:gap-6 xl:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,0.9fr))_minmax(0,1.2fr)]"
      >
        <section
          class="app-footer__panel rounded-2xl p-4 md:rounded-3xl md:p-7"
        >
          <div class="flex items-start gap-3 md:gap-4">
            <img
              src="~/assets/hopnic-logo.svg"
              :alt="t('footer.brand.name')"
              class="h-9 w-9 rounded-xl bg-white/10 p-1.5 md:mt-1 md:h-12 md:w-12 md:rounded-2xl md:p-2"
            />
            <div class="space-y-0.5 md:space-y-2">
              <p
                class="hidden text-xs font-semibold uppercase tracking-[0.24em] text-white/70 md:block"
              >
                {{ t("footer.brand.name") }}
              </p>
              <h2 class="text-xl font-semibold text-white md:text-2xl">
                {{ t("footer.brand.name") }}
              </h2>
              <p class="hidden text-sm text-white/90 md:block">
                {{ t("footer.brand.companyNameTh") }}
              </p>
              <p class="hidden text-sm text-white/70 md:block">
                {{ t("footer.brand.companyNameEn") }}
              </p>
            </div>
          </div>

          <p
            class="mt-3 text-xs leading-5 text-white/90 md:mt-5 md:text-sm md:leading-7"
          >
            {{ t("footer.brand.tagline") }}
          </p>
          <p
            class="mt-3 hidden max-w-xl text-sm leading-7 text-white/65 xl:block"
          >
            {{ t("footer.brand.description") }}
          </p>

          <div
            class="mt-4 grid grid-cols-3 gap-2 md:mt-6 md:gap-3 xl:grid-cols-1 2xl:grid-cols-3"
          >
            <a
              v-for="cta in contactCtas"
              :key="cta.key"
              :href="cta.href"
              class="app-footer__cta inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold md:min-h-0 md:gap-2 md:rounded-2xl md:px-4 md:py-3 md:text-sm"
              :class="cta.mobileClass"
              :target="cta.external ? '_blank' : undefined"
              :rel="cta.external ? 'noopener noreferrer' : undefined"
            >
              <UIcon :name="cta.icon" class="size-4" />
              <span class="md:hidden">{{ cta.compactLabel }}</span>
              <span class="hidden md:inline">{{ cta.label }}</span>
            </a>
          </div>
        </section>

        <section
          v-for="section in footerSections"
          :id="section.id === 'contact' ? 'footer-contact' : undefined"
          :key="section.id"
          class="app-footer__panel rounded-2xl p-3 md:rounded-3xl md:p-6"
        >
          <button
            type="button"
            class="flex min-h-11 w-full items-center justify-between gap-3 py-1 text-left md:hidden"
            :aria-expanded="isOpen(section.id)"
            :aria-controls="`footer-panel-${section.id}`"
            @click="toggleSection(section.id)"
          >
            <span class="text-sm font-semibold text-white">{{
              section.title
            }}</span>
            <UIcon
              name="bx:chevron-down"
              class="footer-accordion-icon size-5 text-white/70"
              :class="isOpen(section.id) ? 'rotate-180' : 'rotate-0'"
            />
          </button>

          <h3 class="hidden text-sm font-semibold text-white md:block">
            {{ section.title }}
          </h3>

          <div
            :id="`footer-panel-${section.id}`"
            class="footer-accordion-panel overflow-hidden transition-all duration-200 ease-out md:max-h-none! md:opacity-100!"
            :class="
              isOpen(section.id)
                ? 'visible max-h-160 pt-2 opacity-100 md:pt-5'
                : 'invisible max-h-0 pt-0 opacity-0 md:visible md:max-h-none md:pt-5 md:opacity-100'
            "
          >
            <nav v-if="section.kind === 'links'" :aria-label="section.title">
              <ul
                class="space-y-2 text-xs text-white/78 md:space-y-3 md:text-sm"
              >
                <li v-for="item in section.links" :key="item.key">
                  <NuxtLink
                    v-if="item.to"
                    :to="item.to"
                    class="app-footer__link"
                  >
                    {{ t(`footer.links.${item.key}`) }}
                  </NuxtLink>
                  <a
                    v-else-if="item.href"
                    :href="item.href"
                    class="app-footer__link"
                    :target="item.external ? '_blank' : undefined"
                    :rel="item.external ? 'noopener noreferrer' : undefined"
                  >
                    {{ t(`footer.links.${item.key}`) }}
                  </a>
                  <span v-else class="app-footer__link app-footer__link--muted">
                    {{ t(`footer.links.${item.key}`) }}
                  </span>
                </li>
              </ul>
            </nav>

            <div
              v-else
              class="space-y-3 text-xs text-white/82 md:space-y-5 md:text-sm"
            >
              <div>
                <p class="font-semibold text-white">
                  {{ t("footer.contact.companyName") }}
                </p>
                <p class="mt-1 text-white/70">
                  {{ t("footer.contact.companyNameEn") }}
                </p>
              </div>

              <address class="not-italic">
                <p class="leading-5 text-white/82 md:leading-7">
                  {{ t("footer.contact.addressLine1") }}<br />
                  {{ t("footer.contact.addressLine2") }}
                </p>
              </address>

              <dl class="space-y-2 md:space-y-3">
                <div
                  v-for="item in contactDetails"
                  :key="item.key"
                  class="grid gap-1"
                >
                  <dt
                    class="text-[10px] font-medium uppercase tracking-wide text-white/55 md:text-xs"
                  >
                    {{ item.label }}
                  </dt>
                  <dd>
                    <a
                      v-if="item.href"
                      :href="item.href"
                      class="app-footer__link inline-flex items-center gap-2"
                      :target="item.external ? '_blank' : undefined"
                      :rel="item.external ? 'noopener noreferrer' : undefined"
                    >
                      <span>{{ item.value }}</span>
                    </a>
                    <span v-else>{{ item.value }}</span>
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </section>
      </div>
    </UContainer>

    <div class="border-t border-white/10 bg-black/10">
      <UContainer
        class="flex flex-col items-center gap-2 py-3 text-center text-xs text-white/72 md:flex-row md:items-center md:justify-between md:gap-4 md:py-5 md:text-left md:text-sm"
      >
        <nav
          :aria-label="t('footer.legal.navLabel')"
          class="flex flex-wrap justify-center gap-x-2 gap-y-1 md:justify-start md:gap-x-4 md:gap-y-2"
        >
          <template v-for="item in legalLinks" :key="item.key">
            <NuxtLink
              v-if="item.to"
              :to="item.to"
              class="app-footer__legal-link"
            >
              {{ t(`footer.legal.${item.key}`) }}
            </NuxtLink>
            <a
              v-else-if="item.href"
              :href="item.href"
              class="app-footer__legal-link"
              :target="item.external ? '_blank' : undefined"
              :rel="item.external ? 'noopener noreferrer' : undefined"
            >
              {{ t(`footer.legal.${item.key}`) }}
            </a>
            <button
              v-else-if="item.action"
              type="button"
              class="app-footer__legal-link"
              @click="onLegalAction(item.action)"
            >
              {{ t(`footer.legal.${item.key}`) }}
            </button>
            <span v-else class="app-footer__legal-link app-footer__link--muted">
              {{ t(`footer.legal.${item.key}`) }}
            </span>
          </template>
        </nav>

        <p class="text-xs text-white/60 md:text-sm">
          {{ t("footer.copyright", { year: 2026 }) }}
        </p>
      </UContainer>
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  background:
    linear-gradient(180deg, rgba(33, 20, 10, 0.12), rgba(33, 20, 10, 0.28)),
    var(--ui-secondary, #815a32);
  padding-bottom: calc(
    var(--mobile-fab-clearance, 88px) + env(safe-area-inset-bottom)
  );
}

.app-footer__panel {
  background: rgba(255, 248, 239, 0.06);
  border: 1px solid rgba(255, 248, 239, 0.1);
  backdrop-filter: blur(10px);
}

.app-footer__cta,
.app-footer__link,
.app-footer__legal-link,
.footer-accordion-icon,
.footer-accordion-panel {
  transition-property:
    background-color, border-color, color, opacity, transform;
}

.app-footer__cta {
  border: 1px solid rgba(241, 179, 35, 0.24);
  background: rgba(241, 179, 35, 0.14);
  color: #fff8ef;
}

.app-footer__cta:hover,
.app-footer__cta:focus-visible {
  background: rgba(241, 179, 35, 0.22);
}

.app-footer__link,
.app-footer__legal-link {
  color: rgba(255, 248, 239, 0.82);
}

.app-footer__link:hover,
.app-footer__link:focus-visible,
.app-footer__legal-link:hover,
.app-footer__legal-link:focus-visible {
  color: #ffffff;
}

.app-footer__link--muted {
  color: rgba(255, 248, 239, 0.48);
}

@media (min-width: 768px) {
  .app-footer {
    padding-bottom: 0;
  }
}

@media (max-width: 767px) {
  .app-footer__legal-link:not(:last-child)::after {
    content: "|";
    margin-left: 0.5rem;
    color: rgba(255, 248, 239, 0.36);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-footer__cta,
  .app-footer__link,
  .app-footer__legal-link,
  .footer-accordion-icon,
  .footer-accordion-panel {
    transition: none;
  }
}
</style>
