<script setup lang="ts">
import {
  formatAuthErrorMeta,
  isLikelyAuthServerError,
  normalizeAuthError,
} from "~/utils/auth-errors";
import {
  getPasswordPolicyChecks,
  isPasswordPolicyMet,
  PASSWORD_POLICY_DESCRIPTION,
} from "~/utils/password-policy";

definePageMeta({ layout: "default" });

const supabase = useSupabaseClient();
const session = useSupabaseSession();
const user = useSupabaseUser();
const { t } = useI18n();
const toast = useToast();

const password = ref("");
const confirmPassword = ref("");
const touched = reactive({ password: false, confirmPassword: false });
const loading = ref(false);
const success = ref(false);
const formErrorTitle = ref<string | null>(null);
const formErrorDescription = ref<string | null>(null);
const sessionChecked = ref(false);
const showPassword = ref(false);
const showConfirmPassword = ref(false);

const passwordChecks = computed(() => getPasswordPolicyChecks(password.value));
const passwordError = computed(() => {
  if (!password.value) return "กรุณากรอกรหัสผ่านใหม่";
  if (!isPasswordPolicyMet(password.value)) return PASSWORD_POLICY_DESCRIPTION;
  return null;
});
const confirmPasswordError = computed(() => {
  if (!confirmPassword.value) return "กรุณายืนยันรหัสผ่านใหม่";
  if (password.value !== confirmPassword.value) return "รหัสผ่านไม่ตรงกัน";
  return null;
});
const hasRecoverySession = computed(() => Boolean(session.value || user.value));
const canSubmit = computed(
  () =>
    hasRecoverySession.value &&
    !passwordError.value &&
    !confirmPasswordError.value &&
    !loading.value,
);

onMounted(async () => {
  const { data } = await supabase.auth.getSession();
  sessionChecked.value = true;
  if (!data.session && !session.value && !user.value) {
    formErrorTitle.value =
      "ลิงก์ตั้งรหัสผ่านใหม่หมดอายุหรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่อีกครั้ง";
    formErrorDescription.value = null;
  }
});

function markTouched() {
  touched.password = true;
  touched.confirmPassword = true;
}

function clearFormError() {
  formErrorTitle.value = null;
  formErrorDescription.value = null;
}

function passwordVisibilityLabel(isVisible: boolean) {
  return isVisible ? t("auth.hidePassword") : t("auth.showPassword");
}

function friendlyUpdateError(error: unknown) {
  const details = normalizeAuthError(error);
  const lower = details.message.toLowerCase();

  if (lower.includes("session") || lower.includes("jwt")) {
    return "เซสชันหมดอายุ กรุณาขอลิงก์ตั้งรหัสผ่านใหม่อีกครั้ง";
  }
  if (lower.includes("password")) return PASSWORD_POLICY_DESCRIPTION;
  if (isLikelyAuthServerError(details)) {
    return "ไม่สามารถตั้งรหัสผ่านใหม่ได้ เนื่องจากเซิร์ฟเวอร์มีปัญหา";
  }
  return "ไม่สามารถตั้งรหัสผ่านใหม่ได้ กรุณาลองใหม่อีกครั้ง";
}

function updateErrorDescription(error: unknown, title: string) {
  const details = normalizeAuthError(error);
  const parts: string[] = [];

  if (details.message !== title) parts.push(details.message);

  const meta = formatAuthErrorMeta(details);
  if (meta) parts.push(meta);

  return parts.length > 0 ? parts.join(" • ") : null;
}

async function onSubmit() {
  markTouched();
  clearFormError();
  if (!canSubmit.value) return;

  loading.value = true;
  try {
    const { error } = await supabase.auth.updateUser({
      password: password.value,
    });
    if (error) {
      formErrorTitle.value = friendlyUpdateError(error);
      formErrorDescription.value = updateErrorDescription(
        error,
        formErrorTitle.value ?? "",
      );
      toast.add({
        title: "ตั้งรหัสผ่านไม่สำเร็จ",
        description: formErrorDescription.value ?? formErrorTitle.value,
        color: "error",
        icon: "bx:error-circle",
      });
      return;
    }
    success.value = true;
    toast.add({
      title: "ตั้งรหัสผ่านใหม่แล้ว",
      color: "success",
      icon: "bx:check-circle",
    });
    setTimeout(() => navigateTo("/user/account"), 800);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <UContainer
    class="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12"
  >
    <UCard class="w-full max-w-md">
      <form class="space-y-5" novalidate @submit.prevent="onSubmit">
        <div class="text-center">
          <UIcon
            name="bx:lock-alt"
            class="mx-auto mb-2 text-4xl text-primary"
          />
          <h1 class="text-xl font-semibold">ตั้งรหัสผ่านใหม่</h1>
          <p class="mt-1 text-sm text-muted">
            กรอกรหัสผ่านใหม่ของคุณ หลังจากเปิดลิงก์กู้คืนจากอีเมล
          </p>
        </div>

        <UAlert
          v-if="success"
          color="success"
          variant="soft"
          icon="bx:check-circle"
          title="ตั้งรหัสผ่านใหม่สำเร็จ"
          description="กำลังพาคุณไปยังบัญชีผู้ใช้"
        />
        <UAlert
          v-else-if="formErrorTitle"
          color="error"
          variant="soft"
          icon="bx:error-circle"
          :title="formErrorTitle"
          :description="formErrorDescription || undefined"
        />
        <UAlert
          v-else-if="sessionChecked && !hasRecoverySession"
          color="warning"
          variant="soft"
          icon="bx:time-five"
          title="ลิงก์ไม่พร้อมใช้งาน"
          description="กรุณาขอลิงก์ตั้งรหัสผ่านใหม่อีกครั้งจากหน้า Forgot Password"
        />

        <UFormField
          class="w-full"
          label="รหัสผ่านใหม่"
          :error="touched.password ? passwordError : undefined"
        >
          <UInput
            v-model="password"
            class="w-full"
            :type="showPassword ? 'text' : 'password'"
            icon="bx:lock-alt"
            placeholder="รหัสผ่านใหม่"
            autocomplete="new-password"
            size="lg"
            @blur="touched.password = true"
          >
            <template #trailing>
              <UButton
                type="button"
                color="neutral"
                variant="ghost"
                size="sm"
                :icon="showPassword ? 'bx:hide' : 'bx:show'"
                :aria-label="passwordVisibilityLabel(showPassword)"
                :title="passwordVisibilityLabel(showPassword)"
                @click.prevent="showPassword = !showPassword"
              />
            </template>
          </UInput>
        </UFormField>

        <div class="rounded-lg bg-elevated/60 px-3 py-2 text-xs text-muted">
          <p class="font-medium text-default">ข้อกำหนดรหัสผ่าน</p>
          <ul class="mt-1 space-y-1">
            <li
              v-for="check in passwordChecks"
              :key="check.label"
              class="flex items-center gap-2"
            >
              <UIcon
                :name="check.met ? 'bx:check-circle' : 'bx:circle'"
                :class="check.met ? 'text-success' : 'text-muted'"
              />
              <span :class="check.met ? 'text-default' : 'text-muted'">{{
                check.label
              }}</span>
            </li>
          </ul>
          <p class="mt-2">แนะนำให้ใช้รหัสที่คาดเดายาก และไม่ซ้ำกับบริการอื่น</p>
        </div>

        <UFormField
          class="w-full"
          label="ยืนยันรหัสผ่านใหม่"
          :error="touched.confirmPassword ? confirmPasswordError : undefined"
        >
          <UInput
            v-model="confirmPassword"
            class="w-full"
            :type="showConfirmPassword ? 'text' : 'password'"
            icon="bx:lock-alt"
            placeholder="ยืนยันรหัสผ่านใหม่"
            autocomplete="new-password"
            size="lg"
            @blur="touched.confirmPassword = true"
          >
            <template #trailing>
              <UButton
                type="button"
                color="neutral"
                variant="ghost"
                size="sm"
                :icon="showConfirmPassword ? 'bx:hide' : 'bx:show'"
                :aria-label="passwordVisibilityLabel(showConfirmPassword)"
                :title="passwordVisibilityLabel(showConfirmPassword)"
                @click.prevent="showConfirmPassword = !showConfirmPassword"
              />
            </template>
          </UInput>
        </UFormField>

        <UButton
          type="submit"
          block
          size="lg"
          :loading="loading"
          :disabled="!canSubmit"
          label="ตั้งรหัสผ่านใหม่"
        />
        <UButton
          to="/user/forgot-password"
          block
          color="neutral"
          variant="ghost"
          label="ขอลิงก์ใหม่"
        />
      </form>
    </UCard>
  </UContainer>
</template>
