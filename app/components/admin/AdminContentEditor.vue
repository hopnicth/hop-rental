<script setup lang="ts">
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Youtube from "@tiptap/extension-youtube";
import { Editor, EditorContent } from "@tiptap/vue-3";
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import {
  emptyLocalizedDoc,
  type LocalizedDoc,
  type TipTapDoc,
} from "~/types/content";
import type { LocaleCode } from "~/types/locale";
import { getAdminApiErrorMessage } from "~/utils/admin-api";

const props = defineProps<{ modelValue: LocalizedDoc; disabled?: boolean }>();
const emit = defineEmits<{
  (e: "update:modelValue", value: LocalizedDoc): void;
}>();

const toast = useToast();

const LOCALES: Array<{ code: LocaleCode; label: string }> = [
  { code: "th", label: "ไทย" },
  { code: "en", label: "EN" },
  { code: "cn", label: "中文" },
  { code: "jp", label: "日本語" },
];

const activeLocale = ref<LocaleCode>("th");
const uploading = ref(false);
const editor = shallowRef<Editor | undefined>(undefined);
// Bumped on every editor transaction so isActive() re-evaluates in template.
const tick = ref(0);

function commitDoc(locale: LocaleCode, doc: TipTapDoc) {
  const next: LocalizedDoc = {
    ...emptyLocalizedDoc(),
    ...(props.modelValue ?? {}),
  };
  next[locale] = doc;
  emit("update:modelValue", next);
}

function buildEditor(locale: LocaleCode) {
  editor.value?.destroy();
  const initial = props.modelValue?.[locale] ?? { type: "doc", content: [] };

  editor.value = new Editor({
    editable: !props.disabled,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: false }),
      Image.configure({ inline: false, allowBase64: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: "เริ่มเขียนเนื้อหา..." }),
      Youtube.configure({ controls: true, nocookie: true }),
    ],
    content: initial as never,
    editorProps: {
      attributes: {
        class: "tiptap-editor focus:outline-none min-h-64 px-4 py-3 text-sm",
      },
    },
    onTransaction: () => {
      tick.value++;
    },
    onUpdate: ({ editor: instance }) => {
      commitDoc(locale, instance.getJSON() as TipTapDoc);
    },
  });
}

function switchLocale(code: LocaleCode) {
  if (code === activeLocale.value) return;
  activeLocale.value = code;
  buildEditor(code);
}

watch(
  () => props.disabled,
  (value) => editor.value?.setEditable(!value),
);

onMounted(() => buildEditor(activeLocale.value));
onBeforeUnmount(() => editor.value?.destroy());

function isActive(name: string, attrs?: Record<string, unknown>) {
  void tick.value;
  return Boolean(editor.value?.isActive(name, attrs));
}

function setHeading(level: 2 | 3 | 4) {
  editor.value?.chain().focus().toggleHeading({ level }).run();
}
function toggleBold() {
  editor.value?.chain().focus().toggleBold().run();
}
function toggleItalic() {
  editor.value?.chain().focus().toggleItalic().run();
}
function toggleStrike() {
  editor.value?.chain().focus().toggleStrike().run();
}
function toggleBulletList() {
  editor.value?.chain().focus().toggleBulletList().run();
}
function toggleOrderedList() {
  editor.value?.chain().focus().toggleOrderedList().run();
}
function toggleBlockquote() {
  editor.value?.chain().focus().toggleBlockquote().run();
}
function setHorizontalRule() {
  editor.value?.chain().focus().setHorizontalRule().run();
}
function clearFormatting() {
  editor.value?.chain().focus().unsetAllMarks().clearNodes().run();
}

function applyLink() {
  if (!editor.value) return;
  const previous = editor.value.getAttributes("link").href ?? "";
  const url = window.prompt("URL (leave empty to remove)", previous);
  if (url === null) return;
  if (url === "") {
    editor.value.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }
  editor.value
    .chain()
    .focus()
    .extendMarkRange("link")
    .setLink({ href: url })
    .run();
}

function addYoutube() {
  if (!editor.value) return;
  const url = window.prompt("YouTube URL");
  if (!url) return;
  editor.value.chain().focus().setYoutubeVideo({ src: url }).run();
}

async function uploadImage(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !editor.value) return;

  uploading.value = true;
  try {
    const form = new FormData();
    form.append("kind", "image");
    form.append("file", file);
    const result = await $fetch<{ url: string }>("/api/admin/content/upload", {
      method: "POST",
      body: form,
    });
    editor.value.chain().focus().setImage({ src: result.url }).run();
  } catch (error) {
    toast.add({
      title: "Upload failed",
      description: getAdminApiErrorMessage(error, "Unknown error"),
      color: "error",
    });
  } finally {
    uploading.value = false;
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center gap-2">
      <button
        v-for="loc in LOCALES"
        :key="loc.code"
        type="button"
        class="rounded px-2.5 py-1 text-xs font-medium transition"
        :class="
          activeLocale === loc.code
            ? 'bg-primary text-inverted'
            : 'bg-elevated text-default hover:bg-accented'
        "
        @click="switchLocale(loc.code)"
      >
        {{ loc.label }}
      </button>
    </div>

    <div class="rounded-lg border border-default bg-white">
      <div
        class="flex flex-wrap items-center gap-1 border-b border-default px-2 py-2"
      >
        <button
          type="button"
          class="rounded px-2 py-1 text-xs font-semibold hover:bg-elevated"
          :class="{ 'bg-elevated': isActive('heading', { level: 2 }) }"
          :disabled="disabled"
          @mousedown.prevent
          @click="setHeading(2)"
        >
          H2
        </button>
        <button
          type="button"
          class="rounded px-2 py-1 text-xs font-semibold hover:bg-elevated"
          :class="{ 'bg-elevated': isActive('heading', { level: 3 }) }"
          :disabled="disabled"
          @mousedown.prevent
          @click="setHeading(3)"
        >
          H3
        </button>
        <button
          type="button"
          class="rounded px-2 py-1 text-xs font-semibold hover:bg-elevated"
          :class="{ 'bg-elevated': isActive('heading', { level: 4 }) }"
          :disabled="disabled"
          @mousedown.prevent
          @click="setHeading(4)"
        >
          H4
        </button>

        <span class="mx-1 h-4 w-px bg-default" />

        <button
          type="button"
          class="rounded p-1.5 hover:bg-elevated"
          :class="{ 'bg-elevated': isActive('bold') }"
          :disabled="disabled"
          @mousedown.prevent
          @click="toggleBold"
        >
          <UIcon name="bx:bold" class="size-4" />
        </button>
        <button
          type="button"
          class="rounded p-1.5 hover:bg-elevated"
          :class="{ 'bg-elevated': isActive('italic') }"
          :disabled="disabled"
          @mousedown.prevent
          @click="toggleItalic"
        >
          <UIcon name="bx:italic" class="size-4" />
        </button>
        <button
          type="button"
          class="rounded p-1.5 hover:bg-elevated"
          :class="{ 'bg-elevated': isActive('strike') }"
          :disabled="disabled"
          @mousedown.prevent
          @click="toggleStrike"
        >
          <UIcon name="bx:strikethrough" class="size-4" />
        </button>

        <span class="mx-1 h-4 w-px bg-default" />

        <button
          type="button"
          class="rounded p-1.5 hover:bg-elevated"
          :class="{ 'bg-elevated': isActive('bulletList') }"
          :disabled="disabled"
          @mousedown.prevent
          @click="toggleBulletList"
        >
          <UIcon name="bx:list-ul" class="size-4" />
        </button>
        <button
          type="button"
          class="rounded p-1.5 hover:bg-elevated"
          :class="{ 'bg-elevated': isActive('orderedList') }"
          :disabled="disabled"
          @mousedown.prevent
          @click="toggleOrderedList"
        >
          <UIcon name="bx:list-ol" class="size-4" />
        </button>
        <button
          type="button"
          class="rounded p-1.5 hover:bg-elevated"
          :class="{ 'bg-elevated': isActive('blockquote') }"
          :disabled="disabled"
          @mousedown.prevent
          @click="toggleBlockquote"
        >
          <UIcon name="bxs:quote-alt-left" class="size-4" />
        </button>
        <button
          type="button"
          class="rounded p-1.5 hover:bg-elevated"
          :disabled="disabled"
          @mousedown.prevent
          @click="setHorizontalRule"
        >
          <UIcon name="bx:minus" class="size-4" />
        </button>

        <span class="mx-1 h-4 w-px bg-default" />

        <button
          type="button"
          class="rounded p-1.5 hover:bg-elevated"
          :class="{ 'bg-elevated': isActive('link') }"
          :disabled="disabled"
          @mousedown.prevent
          @click="applyLink"
        >
          <UIcon name="bx:link" class="size-4" />
        </button>
        <label
          class="inline-flex cursor-pointer rounded p-1.5 hover:bg-elevated"
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="hidden"
            :disabled="disabled"
            @change="uploadImage"
          />
          <UIcon v-if="!uploading" name="bx:image-add" class="size-4" />
          <UIcon v-else name="bx:loader-alt" class="size-4 animate-spin" />
        </label>
        <button
          type="button"
          class="rounded p-1.5 hover:bg-elevated"
          :disabled="disabled"
          @mousedown.prevent
          @click="addYoutube"
        >
          <UIcon name="bxl:youtube" class="size-4" />
        </button>
        <button
          type="button"
          class="rounded p-1.5 hover:bg-elevated"
          :disabled="disabled"
          @mousedown.prevent
          @click="clearFormatting"
        >
          <UIcon name="bx:eraser" class="size-4" />
        </button>
      </div>

      <EditorContent :editor="editor" />
    </div>

    <p class="text-xs text-muted">
      Editing
      <span class="font-semibold uppercase">{{ activeLocale }}</span>
      — switch tabs above to translate.
    </p>
  </div>
</template>

<style scoped>
:deep(.ProseMirror) {
  color: var(--ui-text);
}
:deep(.ProseMirror h2) {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 1rem 0 0.5rem;
  line-height: 1.2;
}
:deep(.ProseMirror h3) {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0.875rem 0 0.5rem;
  line-height: 1.25;
}
:deep(.ProseMirror h4) {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0.75rem 0 0.5rem;
  line-height: 1.3;
}
:deep(.ProseMirror p) {
  margin: 0.5rem 0;
  line-height: 1.6;
}
:deep(.ProseMirror ul) {
  list-style: disc;
  padding-left: 1.5rem;
  margin: 0.5rem 0;
}
:deep(.ProseMirror ol) {
  list-style: decimal;
  padding-left: 1.5rem;
  margin: 0.5rem 0;
}
:deep(.ProseMirror li) {
  margin: 0.25rem 0;
}
:deep(.ProseMirror li > p) {
  margin: 0;
}
:deep(.ProseMirror blockquote) {
  border-left: 3px solid var(--ui-border);
  padding-left: 1rem;
  margin: 0.75rem 0;
  color: var(--ui-text-muted);
  font-style: italic;
}
:deep(.ProseMirror hr) {
  border: 0;
  border-top: 1px solid var(--ui-border);
  margin: 1rem 0;
}
:deep(.ProseMirror a) {
  color: var(--ui-primary);
  text-decoration: underline;
}
:deep(.ProseMirror img) {
  max-width: 100%;
  border-radius: 0.5rem;
  margin: 0.5rem 0;
}
:deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  color: var(--ui-text-muted);
  pointer-events: none;
  height: 0;
}
</style>
