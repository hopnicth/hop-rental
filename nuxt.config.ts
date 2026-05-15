// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },

  app: {
    head: {
      htmlAttrs: {
        "data-color-mode-forced": "light",
      },
      link: [{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
    },
  },

  colorMode: {
    preference: "light",
    fallback: "light",
  },

  css: ["~/assets/css/main.css"],

  runtimeConfig: {
    omiseSecretKey: process.env.OMISE_SECRET_KEY ?? "",
    omiseWebhookSecret: process.env.OMISE_WEBHOOK_SECRET ?? "",
    mixedCheckoutEnabled:
      process.env.NUXT_MIXED_CHECKOUT_ENABLED === "true" ||
      process.env.MIXED_CHECKOUT_ENABLED === "true",
    public: {
      mixedCheckoutEnabled:
        process.env.NUXT_PUBLIC_MIXED_CHECKOUT_ENABLED === "true" ||
        process.env.NUXT_MIXED_CHECKOUT_ENABLED === "true" ||
        process.env.MIXED_CHECKOUT_ENABLED === "true",
      omisePublicKey:
        process.env.NUXT_PUBLIC_OMISE_PUBLIC_KEY ??
        process.env.OMISE_PUBLIC_KEY ??
        "",
      chatSupportLineUrl:
        process.env.NUXT_PUBLIC_CHAT_SUPPORT_LINE_URL ??
        "https://line.me/R/ti/p/@832vmicv?ts=03031436&oat_content=url",
      chatSupportPhone:
        process.env.NUXT_PUBLIC_CHAT_SUPPORT_PHONE ?? "+66 95-479-2333",
    },
  },

  modules: [
    "@nuxt/a11y",
    "@nuxt/eslint",
    "@nuxt/content",
    "@nuxt/image",
    "@nuxt/scripts",
    "@nuxt/ui",
    "@nuxtjs/i18n",
    "@nuxtjs/supabase",
  ],

  supabase: {
    redirectOptions: {
      login: "/user/login",
      callback: "/user/confirm",
      exclude: [
        "/",
        "/search",
        "/product-*",
        "/product-*/**",
        "/asset/*",
        "/asset/**",
        "/services",
        "/services/**",
        "/blog",
        "/blog/**",
        "/promotions",
        "/promotions/**",
        "/reviews",
        "/reviews/**",
        "/user/forgot-password",
        "/user/reset-password",
      ],
      saveRedirectToCookie: true,
    },
    cookieOptions: {
      maxAge: 60 * 60 * 5, // 5 hours — match idle timeout
      sameSite: "lax",
      // Local development runs on http://localhost, where Secure cookies are
      // not sent back to Nitro APIs. Keep Secure enabled for deployed HTTPS.
      secure: process.env.NODE_ENV === "production",
    },
  },

  i18n: {
    locales: [
      { code: "th", name: "TH", language: "th-TH", file: "th.json" },
      { code: "en", name: "EN", language: "en-US", file: "en.json" },
      { code: "cn", name: "CN", language: "zh-CN", file: "cn.json" },
      { code: "jp", name: "JP", language: "ja-JP", file: "jp.json" },
    ],
    defaultLocale: "th",
    langDir: "locales",
    strategy: "no_prefix",
    // Do not let Accept-Language override the product default. Locale is
    // restored explicitly from `hop_locale` by app/plugins/i18n-cookie.ts.
    detectBrowserLanguage: false,
  },
});
