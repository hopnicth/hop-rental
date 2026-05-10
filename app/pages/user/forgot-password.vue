<script setup lang="ts">
definePageMeta({ layout: "default" });

const supabase = useSupabaseClient();
const toast = useToast();

const email = ref("");
const touched = ref(false);
const loading = ref(false);
const sent = ref(false);
const formError = ref<string | null>(null);

const normalizedEmail = computed(() => email.value.trim().toLowerCase());
const emailError = computed(() => {
  if (!normalizedEmail.value) return "กรุณากรอกอีเมล";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail.value)) {
    return "รูปแบบอีเมลไม่ถูกต้อง";
  }
  return null;
});
const canSubmit = computed(() => !emailError.value && !loading.value);

function friendlyResetError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "มีการขอลิงก์หลายครั้ง กรุณารอสักครู่แล้วลองใหม่";
  }
  return "ไม่สามารถส่งลิงก์กู้คืนรหัสผ่านได้ กรุณาลองใหม่อีกครั้ง";
}

async function onSubmit() {
  touched.value = true;
  formError.value = null;
  if (!canSubmit.value) return;

  loading.value = true;
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(
      normalizedEmail.value,
      {
        redirectTo: `${window.location.origin}/user/reset-password`,
      },
    );
    if (error) {
      formError.value = friendlyResetError(error.message);
      toast.add({ title: "ส่งลิงก์ไม่สำเร็จ", description: formError.value, color: "error", icon: "bx:error-circle" });
      return;
    }
    sent.value = true;
    toast.add({
      title: "ส่งลิงก์กู้คืนรหัสผ่านแล้ว",
      description: "กรุณาตรวจสอบอีเมลของคุณ",
      color: "success",
      icon: "bx:envelope",
    });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <UContainer class="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
    <UCard class="w-full max-w-md">
      <form class="space-y-5" novalidate @submit.prevent="onSubmit">
        <div class="text-center">
          <UIcon name="bx:lock-open-alt" class="mx-auto mb-2 text-4xl text-primary" />
          <h1 class="text-xl font-semibold">ลืมรหัสผ่าน?</h1>
          <p class="mt-1 text-sm text-muted">
            กรอกอีเมลที่ใช้สมัคร ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้คุณ
          </p>
        </div>

        <UAlert v-if="sent" color="success" variant="soft" icon="bx:envelope" title="ตรวจสอบอีเมลของคุณ" description="หากอีเมลนี้มีอยู่ในระบบ คุณจะได้รับลิงก์สำหรับตั้งรหัสผ่านใหม่ภายในไม่กี่นาที" />
        <UAlert v-if="formError" color="error" variant="soft" icon="bx:error-circle" :title="formError" />

        <UFormField class="w-full" label="อีเมล" :error="touched ? emailError : undefined">
          <UInput v-model="email" class="w-full" type="email" icon="bx:envelope" placeholder="you@example.com" autocomplete="email" size="lg" @blur="touched = true" />
        </UFormField>

        <UButton type="submit" block size="lg" :loading="loading" :disabled="!canSubmit" label="ส่งลิงก์กู้คืนรหัสผ่าน" />
        <UButton to="/user/login" block color="neutral" variant="ghost" label="กลับไปหน้าเข้าสู่ระบบ" />
      </form>
    </UCard>
  </UContainer>
</template>