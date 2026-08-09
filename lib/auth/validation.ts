/** Valid school email for verified student status — must end in .edu */
export function isEduEmail(value: string): boolean {
  const v = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.edu$/i.test(v);
}

export function isValidEmail(value: string): boolean {
  const v = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** Digits-only phone, 10–15 digits after stripping formatting. */
export function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidPhone(value: string): boolean {
  const digits = normalizePhone(value);
  return digits.length >= 10 && digits.length <= 15;
}

export function isValidPassword(value: string): boolean {
  return value.length >= 6;
}

/** Age check — Instagram-style 13+ */
export function isOldEnough(birthday: Date, minAge = 13): boolean {
  const today = new Date();
  let age = today.getFullYear() - birthday.getFullYear();
  const m = today.getMonth() - birthday.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthday.getDate())) age -= 1;
  return age >= minAge;
}

export type ContactKind = 'phone' | 'email' | 'student';

/**
 * Supabase auth always needs an email. Phone logins use a stable synthetic address.
 */
export function contactToAuthEmail(kind: ContactKind, raw: string): string {
  if (kind === 'phone') {
    return `${normalizePhone(raw)}@phone.abroadster.app`;
  }
  return raw.trim().toLowerCase();
}

export function formatPhoneDisplay(digits: string): string {
  const d = normalizePhone(digits).slice(0, 15);
  if (!d) return '';
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  if (d.length <= 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  // International (11–15): keep every digit — do not clamp to 10
  const local = d.slice(-10);
  const country = d.slice(0, d.length - 10);
  return `+${country} (${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}
