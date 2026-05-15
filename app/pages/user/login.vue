<script setup lang="ts">
import type { AuthError } from "@supabase/supabase-js";
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

const route = useRoute();
const supabase = useSupabaseClient();
const user = useSupabaseUser();
const { t } = useI18n();
const toast = useToast();

type AuthMode = "password" | "magic";
type AccountMode = "in" | "up";
type AuthIntent = "sign-in" | "sign-up" | "magic-link" | "oauth";

const accountMode = ref<AccountMode>("in");
const authMode = ref<AuthMode>("password");
const loading = ref(false);
const email = ref("");
const password = ref("");
const confirmPassword = ref("");
const formErrorTitle = ref<string | null>(null);
const formErrorDescription = ref<string | null>(null);
const showPassword = ref(false);
const showConfirmPassword = ref(false);
const touched = reactive({
  email: false,
  password: false,
  confirmPassword: false,
});

const redirectTarget = computed(() => {
  const raw = Array.isArray(route.query.redirect)
    ? route.query.redirect[0]
    : route.query.redirect;
  if (typeof raw !== "string") return "/";
  try {
    const decoded = decodeURIComponent(raw);
    return decoded.startsWith("/") && !decoded.startsWith("//") ? decoded : "/";
  } catch {
    return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  }
});

const normalizedEmail = computed(() => email.value.trim().toLowerCase());
const emailError = computed(() => {
  if (!normalizedEmail.value) return "กรุณากรอกอีเมล";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail.value)) {
    return "รูปแบบอีเมลไม่ถูกต้อง";
  }
  return null;
});
const passwordChecks = computed(() => getPasswordPolicyChecks(password.value));
const isStrongPassword = computed(() => isPasswordPolicyMet(password.value));
const passwordError = computed(() => {
  if (authMode.value !== "password") return null;
  if (!password.value) return "กรุณากรอกรหัสผ่าน";
  if (accountMode.value === "up" && !isStrongPassword.value) {
    return PASSWORD_POLICY_DESCRIPTION;
  }
  return null;
});
const confirmPasswordError = computed(() => {
  if (accountMode.value !== "up" || authMode.value !== "password") return null;
  if (!confirmPassword.value) return "กรุณายืนยันรหัสผ่าน";
  if (password.value !== confirmPassword.value) return "รหัสผ่านไม่ตรงกัน";
  return null;
});
const canSubmit = computed(
  () =>
    !emailError.value && !passwordError.value && !confirmPasswordError.value,
);

watchEffect(() => {
  if (user.value) void navigateTo(redirectTarget.value, { replace: true });
});

function markAllTouched() {
  touched.email = true;
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

function toastTitleForIntent(intent: AuthIntent) {
  switch (intent) {
    case "sign-up":
      return t("auth.signUpError");
    case "magic-link":
      return t("auth.magicLinkError");
    case "oauth":
      return t("auth.oauthError");
    default:
      return t("auth.loginError");
  }
}

function friendlyAuthError(error: unknown, intent: AuthIntent): string {
  const details = normalizeAuthError(error);
  const message = details.message.toLowerCase();

  if (message.includes("invalid login credentials")) {
    return "ไม่พบอีเมลนี้ในระบบ หรือรหัสผ่านไม่ถูกต้อง";
  }
  if (message.includes("email not confirmed")) {
    return "อีเมลนี้ยังไม่ได้ยืนยัน กรุณาตรวจสอบกล่องจดหมาย";
  }
  if (message.includes("user already registered")) {
    return "อีเมลนี้ถูกใช้งานแล้ว กรุณาเข้าสู่ระบบแทน";
  }
  if (message.includes("rate limit") || message.includes("too many")) {
    return "มีการพยายามเข้าสู่ระบบหลายครั้ง กรุณารอสักครู่แล้วลองใหม่";
  }

  if (intent === "sign-up" && isLikelyAuthServerError(details)) {
    return t("auth.signUpServerError");
  }

  if (intent === "magic-link") {
    return t("auth.magicLinkError");
  }

  if (intent === "oauth") {
    return t("auth.oauthError");
  }

  return intent === "sign-up"
    ? "ไม่สามารถสมัครสมาชิกได้ กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง"
    : "ไม่สามารถเข้าสู่ระบบได้ กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง";
}

function authErrorDescription(
  error: unknown,
  intent: AuthIntent,
  title: string,
) {
  const details = normalizeAuthError(error);
  const parts: string[] = [];

  if (
    (intent === "sign-up" || isLikelyAuthServerError(details)) &&
    details.message !== title
  ) {
    parts.push(details.message);
  }

  if (intent === "sign-up" && isLikelyAuthServerError(details)) {
    parts.push(t("auth.signUpServerErrorHint"));
  }

  const meta = formatAuthErrorMeta(details);
  if (meta) parts.push(meta);

  return parts.length > 0 ? parts.join(" • ") : null;
}

function showError(error: AuthError, intent: AuthIntent) {
  const title = friendlyAuthError(error, intent);
  const description = authErrorDescription(error, intent, title);

  formErrorTitle.value = title;
  formErrorDescription.value = description;

  console.error(`[auth:${intent}]`, normalizeAuthError(error));

  toast.add({
    title: toastTitleForIntent(intent),
    description: description ?? title,
    icon: "bx:error-circle",
    color: "error",
  });
}

async function signInWithPassword() {
  const { error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail.value,
    password: password.value,
  });
  if (error) return showError(error, "sign-in");
  toast.add({
    title: t("auth.loginSuccess"),
    icon: "bx:check-circle",
    color: "success",
  });
  await navigateTo(redirectTarget.value, { replace: true });
}

async function signUpWithEmail() {
  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail.value,
    password: password.value,
    options: {
      emailRedirectTo: `${window.location.origin}/user/confirm?redirect=${encodeURIComponent(redirectTarget.value)}`,
    },
  });
  if (error) return showError(error, "sign-up");
  if (
    data.user &&
    (!data.user.identities || data.user.identities.length === 0)
  ) {
    formErrorTitle.value = "อีเมลนี้ถูกใช้งานแล้ว กรุณาเข้าสู่ระบบแทน";
    formErrorDescription.value = null;
    toast.add({
      title: t("auth.signUpError"),
      description: formErrorTitle.value,
      color: "error",
    });
    return;
  }
  toast.add({
    title: data.session ? t("auth.signUpSuccess") : t("auth.signUpCheckEmail"),
    icon: data.session ? "bx:check-circle" : "bx:envelope",
    color: data.session ? "success" : "info",
  });
  if (data.session) await navigateTo(redirectTarget.value, { replace: true });
}

async function sendMagicLink() {
  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail.value,
    options: {
      emailRedirectTo: `${window.location.origin}/user/confirm?redirect=${encodeURIComponent(redirectTarget.value)}`,
    },
  });
  if (error) return showError(error, "magic-link");
  toast.add({
    title: "ส่งลิงก์เข้าสู่ระบบแล้ว",
    description: "กรุณาตรวจสอบอีเมลและกดลิงก์เพื่อเข้าสู่ระบบ",
    icon: "bx:envelope",
    color: "success",
  });
}

async function signInWithGoogle() {
  loading.value = true;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/user/confirm?redirect=${encodeURIComponent(redirectTarget.value)}`,
    },
  });
  loading.value = false;
  if (error) showError(error, "oauth");
}

async function onSubmit() {
  if (loading.value) return;
  clearFormError();
  markAllTouched();
  if (!canSubmit.value) return;

  loading.value = true;
  try {
    if (authMode.value === "magic") await sendMagicLink();
    else if (accountMode.value === "up") await signUpWithEmail();
    else await signInWithPassword();
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <UContainer
    class="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12"
  >
    <UCard class="w-full max-w-md">
      <form class="space-y-5" novalidate @submit.prevent="onSubmit">
        <div class="text-center">
          <UIcon
            name="bx:user-circle"
            class="mx-auto mb-2 text-4xl text-primary"
          />
          <h1 class="text-xl font-semibold">
            {{
              accountMode === "in"
                ? t("auth.loginTitle")
                : t("auth.signUpTitle")
            }}
          </h1>
          <p class="mt-1 text-sm text-muted">
            {{
              accountMode === "in"
                ? t("auth.loginSubtitle")
                : t("auth.signUpSubtitle")
            }}
          </p>
        </div>

        <div class="grid grid-cols-2 gap-2 rounded-xl bg-elevated p-1">
          <UButton
            label="รหัสผ่าน"
            :variant="authMode === 'password' ? 'solid' : 'ghost'"
            block
            @click="authMode = 'password'"
          />
          <UButton
            label="Magic Link"
            :variant="authMode === 'magic' ? 'solid' : 'ghost'"
            block
            @click="authMode = 'magic'"
          />
        </div>

        <UAlert
          v-if="authMode === 'magic'"
          color="info"
          variant="soft"
          icon="bx:info-circle"
          title="Magic Link คืออะไร?"
          description="Magic Link คือการเข้าสู่ระบบแบบไม่ต้องใช้รหัสผ่าน ระบบจะส่งลิงก์เข้าอีเมลของคุณ เมื่อกดลิงก์นั้นก็จะเข้าสู่ระบบได้ทันที เหมาะสำหรับคนที่ไม่อยากจำรหัสผ่านหรือใช้อุปกรณ์ส่วนตัว"
        />

        <UAlert
          v-if="formErrorTitle"
          color="error"
          variant="soft"
          icon="bx:error-circle"
          :title="formErrorTitle"
          :description="formErrorDescription || undefined"
        />

        <UFormField
          class="w-full"
          :label="t('auth.emailLabel')"
          :error="touched.email ? emailError : undefined"
        >
          <UInput
            v-model="email"
            type="email"
            icon="bx:envelope"
            :placeholder="t('auth.emailPlaceholder')"
            autocomplete="email"
            size="lg"
            class="w-full"
            @blur="touched.email = true"
          />
        </UFormField>

        <template v-if="authMode === 'password'">
          <UFormField
            class="w-full"
            :label="t('auth.passwordLabel')"
            :error="touched.password ? passwordError : undefined"
          >
            <UInput
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              icon="bx:lock-alt"
              :placeholder="t('auth.passwordPlaceholder')"
              :autocomplete="
                accountMode === 'in' ? 'current-password' : 'new-password'
              "
              size="lg"
              class="w-full"
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
          <div v-if="accountMode === 'in'" class="-mt-3 text-right">
            <UButton
              to="/user/forgot-password"
              variant="link"
              class="p-0 text-xs"
              label="ลืมรหัสผ่าน?"
            />
          </div>
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
                <span :class="check.met ? 'text-default' : 'text-muted'">
                  {{ check.label }}
                </span>
              </li>
            </ul>
            <p class="mt-2">
              แนะนำให้ใช้รหัสที่คาดเดายาก และไม่ซ้ำกับบริการอื่น
            </p>
            <p v-if="accountMode === 'in'" class="mt-1 text-[11px]">
              ข้อกำหนดนี้ใช้สำหรับการสมัครสมาชิกใหม่
            </p>
            <p v-else class="mt-1 text-[11px]">
              ระบบจะตรวจข้อกำหนดนี้ก่อนสมัครสมาชิก
            </p>
          </div>
          <div
            v-if="accountMode === 'up' && touched.password && passwordError"
            class="text-xs text-error"
          >
            {{ passwordError }}
          </div>
          <UFormField
            v-if="accountMode === 'up'"
            class="w-full"
            :label="t('auth.confirmPasswordLabel')"
            :error="touched.confirmPassword ? confirmPasswordError : undefined"
          >
            <UInput
              v-model="confirmPassword"
              :type="showConfirmPassword ? 'text' : 'password'"
              icon="bx:lock-alt"
              :placeholder="t('auth.confirmPasswordPlaceholder')"
              autocomplete="new-password"
              size="lg"
              class="w-full"
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
        </template>
        <template v-else-if="accountMode === 'up'">
          <div class="rounded-lg bg-elevated/60 px-3 py-2 text-xs text-muted">
            <p class="font-medium text-default">ข้อกำหนดรหัสผ่าน</p>
            <ul class="mt-1 list-disc space-y-0.5 pl-4">
              <li>อย่างน้อย 6 ตัวอักษร</li>
              <li>มีตัวพิมพ์เล็กอย่างน้อย 1 ตัว</li>
              <li>มีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว</li>
              <li>มีตัวเลขอย่างน้อย 1 ตัว</li>
            </ul>
            <p class="mt-2">
              แนะนำให้ใช้รหัสที่คาดเดายาก และไม่ซ้ำกับบริการอื่น
            </p>
          </div>
        </template>

        <UButton
          type="submit"
          block
          size="lg"
          :loading="loading"
          :disabled="loading || !canSubmit"
          :label="
            authMode === 'magic'
              ? 'ส่ง Magic Link'
              : accountMode === 'in'
                ? t('auth.signInButton')
                : t('auth.signUpButton')
          "
        />

        <div class="relative py-1 text-center text-xs text-muted">
          <span class="bg-white px-2">{{ t("auth.orContinueWith") }}</span>
        </div>
        <UButton
          icon="bx:bxl-google"
          color="neutral"
          variant="outline"
          block
          :disabled="loading"
          :label="t('auth.signInWithGoogle')"
          @click="signInWithGoogle"
        />

        <p
          v-if="authMode === 'password'"
          class="text-center text-sm text-muted"
        >
          {{
            accountMode === "in" ? t("auth.noAccount") : t("auth.hasAccount")
          }}
          <UButton
            variant="link"
            class="p-0"
            :label="
              accountMode === 'in'
                ? t('auth.signUpButton')
                : t('auth.signInButton')
            "
            @click="accountMode = accountMode === 'in' ? 'up' : 'in'"
          />
        </p>
      </form>
    </UCard>
  </UContainer>
</template>
