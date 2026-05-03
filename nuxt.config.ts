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
    public: {
      omisePublicKey:
        process.env.NUXT_PUBLIC_OMISE_PUBLIC_KEY ??
        process.env.OMISE_PUBLIC_KEY ??
        "",
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
      exclude: ["/", "/product-*", "/product-*/**", "/search"],
      saveRedirectToCookie: true,
    },
    cookieOptions: {
      maxAge: 60 * 60 * 5, // 5 hours — match idle timeout
      sameSite: "lax",
      secure: true,
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
