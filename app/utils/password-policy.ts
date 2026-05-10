export interface PasswordPolicyCheck {
  label: string;
  met: boolean;
}

export const PASSWORD_POLICY_DESCRIPTION =
  "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร และประกอบด้วยตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก และตัวเลข";

export function getPasswordPolicyChecks(password: string): PasswordPolicyCheck[] {
  return [
    {
      label: "อย่างน้อย 6 ตัวอักษร",
      met: password.length >= 6,
    },
    {
      label: "มีตัวพิมพ์เล็กอย่างน้อย 1 ตัว",
      met: /[a-z]/.test(password),
    },
    {
      label: "มีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว",
      met: /[A-Z]/.test(password),
    },
    {
      label: "มีตัวเลขอย่างน้อย 1 ตัว",
      met: /[0-9]/.test(password),
    },
  ];
}

export function isPasswordPolicyMet(password: string): boolean {
  return getPasswordPolicyChecks(password).every((check) => check.met);
}