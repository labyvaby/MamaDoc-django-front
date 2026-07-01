/**
 * Centralised frontend validation rules for employee fields.
 *
 * These rules mirror the backend validators in
 * server/apps/staff/validators.py — keep them in sync.
 *
 * Each validator returns an error string (non-empty = invalid) or ""
 * (empty = valid). Callers decide whether to show the error after blur
 * or on submit.
 */

import {
  composePhone,
  getPhoneLocalMaxLength,
  type PhoneCountryCode,
} from "../../utility/phone";

// ── ФИО ───────────────────────────────────────────────────────────────────────

export function validateFullName(value: string): string {
  if (!value.trim()) return "ФИО обязательно";
  if (value.length > 255) return "ФИО не может быть длиннее 255 символов";
  return "";
}

// ── Телефон ───────────────────────────────────────────────────────────────────

/**
 * Validate the local part of the phone number (digits only, correct length).
 * Returns an error string or "".
 */
export function validatePhoneLocal(
  local: string,
  countryCode: PhoneCountryCode,
): string {
  if (!local) return ""; // optional
  if (!/^\d+$/.test(local)) return "Только цифры";
  const maxLen = getPhoneLocalMaxLength(countryCode);
  if (local.length !== maxLen) {
    return `Для ${countryCode} требуется ровно ${maxLen} цифр`;
  }
  return "";
}

/**
 * Compose and validate the full E.164 phone.
 * Returns { composed, error }.
 *   composed — E.164 string or null (when local is empty → field is cleared)
 *   error    — human-readable message or ""
 */
export function validatePhone(
  local: string,
  countryCode: PhoneCountryCode,
): { composed: string | null; error: string } {
  const localError = validatePhoneLocal(local, countryCode);
  if (localError) return { composed: null, error: localError };
  const composed = composePhone(countryCode, local);
  return { composed, error: "" };
}

// ── Email ─────────────────────────────────────────────────────────────────────

const TYPO_DOMAINS: Record<string, string> = {
  "mai.ru": "mail.ru",
  "gmai.com": "gmail.com",
  "gamil.com": "gmail.com",
};

export function validateEmail(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return ""; // optional
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return "Некорректный формат email";
  }
  const domain = trimmed.toLowerCase().split("@")[1] ?? "";
  const suggestion = TYPO_DOMAINS[domain];
  if (suggestion) {
    return `Опечатка? Возможно, @${suggestion}`;
  }
  return "";
}

// ── Дата рождения ─────────────────────────────────────────────────────────────

export function validateBirthDate(value: string | null | undefined): string {
  if (!value) return ""; // optional
  const d = new Date(value);
  if (isNaN(d.getTime())) return "Некорректная дата";
  if (d > new Date()) return "Дата рождения не может быть в будущем";
  return "";
}

// ── Telegram ID ───────────────────────────────────────────────────────────────

export function validateTelegramId(value: string): string {
  if (!value.trim()) return ""; // optional
  if (!/^\d+$/.test(value.trim())) return "Telegram ID должен содержать только цифры";
  if (value.trim().length > 20) return "Telegram ID не может превышать 20 цифр";
  return "";
}

// ── Расчётный счёт ────────────────────────────────────────────────────────────

export function validateBankAccountNumber(value: string): string {
  if (!value) return ""; // optional
  if (!/^\d+$/.test(value)) return "Только цифры";
  if (value.length > 16) return "Не более 16 цифр";
  if (value.length > 0 && value.length < 16) {
    return `Введите все 16 цифр (сейчас ${value.length})`;
  }
  return "";
}

// ── ИНН ───────────────────────────────────────────────────────────────────────

export function validateInn(value: string): string {
  if (!value) return ""; // optional
  if (!/^\d+$/.test(value)) return "ИНН должен содержать только цифры";
  if (value.length > 14) return "ИНН не может превышать 14 цифр";
  return "";
}

// ── Instagram ─────────────────────────────────────────────────────────────────

export function validateInstagram(value: string): string {
  const v = value.trim().replace(/^@/, "");
  if (!v) return ""; // optional
  if (!/^[A-Za-z0-9._]{1,30}$/.test(v)) {
    return "Только латиница, цифры, точка и _ (до 30 символов, без @)";
  }
  return "";
}

// ── БИК ───────────────────────────────────────────────────────────────────────

export function validateBik(value: string): string {
  const v = value.trim();
  if (!v) return ""; // optional
  if (!/^\d+$/.test(v)) return "БИК: только цифры";
  if (v.length !== 6) return "БИК должен содержать ровно 6 цифр";
  return "";
}

// ── Логин ─────────────────────────────────────────────────────────────────────

export function validateUsername(value: string): string {
  if (!value.trim()) return ""; // optional
  if (value.length > 150) return "Логин не может превышать 150 символов";
  if (!/^[\w.@+\-]+$/.test(value)) {
    return "Логин может содержать только буквы, цифры и символы: _ @ . + -";
  }
  return "";
}

// ── Пароль ────────────────────────────────────────────────────────────────────

export function validatePassword(value: string): string {
  // Do NOT trim — spaces in passwords are intentional.
  if (value.length > 0 && value.length < 8) {
    return "Пароль должен содержать минимум 8 символов";
  }
  return "";
}
