export interface PasswordPolicyCheck {
  label: string;
  met: boolean;
}

export interface PasswordPolicyLabels {
  minLength: string;
  lowercase: string;
  uppercase: string;
  digit: string;
}

export const PASSWORD_POLICY_DESCRIPTION =
  "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร และประกอบด้วยตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก และตัวเลข";

const DEFAULT_PASSWORD_POLICY_LABELS: PasswordPolicyLabels = {
  minLength: "อย่างน้อย 6 ตัวอักษร",
  lowercase: "มีตัวพิมพ์เล็กอย่างน้อย 1 ตัว",
  uppercase: "มีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว",
  digit: "มีตัวเลขอย่างน้อย 1 ตัว",
};

export function getPasswordPolicyChecks(
  password: string,
  labels: PasswordPolicyLabels = DEFAULT_PASSWORD_POLICY_LABELS,
): PasswordPolicyCheck[] {
  return [
    {
      label: labels.minLength,
      met: password.length >= 6,
    },
    {
      label: labels.lowercase,
      met: /[a-z]/.test(password),
    },
    {
      label: labels.uppercase,
      met: /[A-Z]/.test(password),
    },
    {
      label: labels.digit,
      met: /[0-9]/.test(password),
    },
  ];
}

export function isPasswordPolicyMet(password: string): boolean {
  return getPasswordPolicyChecks(password).every((check) => check.met);
}
