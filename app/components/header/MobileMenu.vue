<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from "@nuxt/ui";

const { t } = useI18n();

const props = defineProps<{
  items: NavigationMenuItem[];
}>();

// TODO: Replace with actual auth state
const isSignIn = ref(false);

const dropdownItems = computed<DropdownMenuItem[][]>(() => {
  const navGroup: DropdownMenuItem[] = props.items
    .filter((item) => item.label)
    .map((item) => ({
      label: item.label!,
      icon: item.icon as string | undefined,
      to: item.to as string | undefined,
    }));

  const userGroup: DropdownMenuItem[] = isSignIn.value
    ? [
        { label: t("user.profile"), icon: "bx:user" },
        {
          label: t("user.logout"),
          icon: "bx:log-out",
          color: "error" as const,
        },
      ]
    : [
        { label: t("user.signIn"), icon: "bx:log-in" },
        { label: t("user.signUp"), icon: "bx:user-plus" },
      ];

  return [navGroup, userGroup];
});
</script>

<template>
  <UDropdownMenu :items="dropdownItems">
    <UButton icon="bx:menu" color="neutral" variant="soft" />
  </UDropdownMenu>
</template>
