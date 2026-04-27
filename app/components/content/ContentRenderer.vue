<script setup lang="ts">
import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Youtube from "@tiptap/extension-youtube";
import { computed } from "vue";
import type { LocalizedDoc, TipTapDoc } from "~/types/content";
import type { LocaleCode } from "~/types/locale";

const props = defineProps<{ body: LocalizedDoc }>();

const { locale } = useI18n();
const lang = computed(() => locale.value as LocaleCode);

const EXTENSIONS = [
  StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: false }),
  Image.configure({ inline: false, allowBase64: false }),
  Link.configure({ openOnClick: true, autolink: true }),
  Youtube.configure({ controls: true, nocookie: true }),
];

function pickDoc(): TipTapDoc {
  const body = props.body;
  if (!body) return { type: "doc", content: [] };
  const order: LocaleCode[] = [lang.value, "th", "en", "cn", "jp"];
  for (const code of order) {
    const doc = body[code];
    if (doc?.content && Array.isArray(doc.content) && doc.content.length) {
      return doc;
    }
  }
  return body[lang.value] ?? { type: "doc", content: [] };
}

const html = computed(() => {
  try {
    return generateHTML(pickDoc() as never, EXTENSIONS);
  } catch {
    return "";
  }
});
</script>

<template>
  <article class="tiptap-output max-w-none" v-html="html" />
</template>

<style scoped>
.tiptap-output :deep(h2) {
  font-size: 1.875rem;
  font-weight: 700;
  margin: 1.5rem 0 0.75rem;
  line-height: 1.2;
}
.tiptap-output :deep(h3) {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 1.25rem 0 0.5rem;
  line-height: 1.25;
}
.tiptap-output :deep(h4) {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 1rem 0 0.5rem;
  line-height: 1.3;
}
.tiptap-output :deep(p) {
  margin: 0.75rem 0;
  line-height: 1.7;
}
.tiptap-output :deep(ul) {
  list-style: disc;
  padding-left: 1.5rem;
  margin: 0.75rem 0;
}
.tiptap-output :deep(ol) {
  list-style: decimal;
  padding-left: 1.5rem;
  margin: 0.75rem 0;
}
.tiptap-output :deep(li) {
  margin: 0.25rem 0;
}
.tiptap-output :deep(li > p) {
  margin: 0;
}
.tiptap-output :deep(blockquote) {
  border-left: 3px solid var(--ui-border);
  padding-left: 1rem;
  margin: 1rem 0;
  color: var(--ui-text-muted);
  font-style: italic;
}
.tiptap-output :deep(hr) {
  border: 0;
  border-top: 1px solid var(--ui-border);
  margin: 1.5rem 0;
}
.tiptap-output :deep(a) {
  color: var(--ui-primary);
  text-decoration: underline;
}
.tiptap-output :deep(img) {
  max-width: 100%;
  border-radius: 0.5rem;
  margin: 1rem 0;
}
.tiptap-output :deep(div[data-youtube-video]) {
  margin: 1rem 0;
}
.tiptap-output :deep(div[data-youtube-video] iframe) {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 0.5rem;
  border: 0;
}
</style>
