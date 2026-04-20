export default defineNuxtPlugin(() => {
  const colorMode = useColorMode();

  colorMode.preference = "light";
  colorMode.value = "light";
  colorMode.forced = true;

  if (import.meta.client) {
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
    document.documentElement.setAttribute("data-color-mode-forced", "light");
    window.localStorage.setItem("nuxt-color-mode", "light");
  }
});