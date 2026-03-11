// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },

  app: {
    head: {
      link: [{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
    },
  },

  css: ["~/assets/css/main.css"],

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
      exclude: ["/", "/product-*", "/product-*/**"],
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
      { code: "th", name: "TH", file: "th.json" },
      { code: "en", name: "EN", file: "en.json" },
      { code: "cn", name: "CN", file: "cn.json" },
      { code: "jp", name: "JP", file: "jp.json" },
    ],
    defaultLocale: "th",
    langDir: "locales",
    strategy: "no_prefix",
  },
});
