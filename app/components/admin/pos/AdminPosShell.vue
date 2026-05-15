<template>
  <div class="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
    <aside class="space-y-4">
      <slot name="sidebar" />
    </aside>

    <section class="space-y-4 min-w-0">
      <slot name="header" />
      <slot />
    </section>
  </div>
</template>