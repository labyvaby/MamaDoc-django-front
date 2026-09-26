/**
 * ИНН (ПИН) физлица КР: 14 цифр; 1-я — пол (1 — женский, 2 — мужской),
 * 2–9 — дата рождения ДДММГГГГ. Та же проверка, что на бэке
 * (`server/apps/patients/inn.py`), — чтобы форма заполняла пол и дату сразу.
 */
export type KgPinResult =
  | { ok: true; gender: "male" | "female"; birthDate: string }
  | { ok: false; error: string };

const PIN_RE = /^\d{14}$/;

export function parseKgPin(value: string): KgPinResult {
  if (!PIN_RE.test(value)) return { ok: false, error: "ИНН — 14 цифр" };
  const gender = value[0] === "1" ? "female" : value[0] === "2" ? "male" : null;
  if (!gender) return { ok: false, error: "Первая цифра ИНН (пол) — 1 или 2" };
  const dd = Number(value.slice(1, 3));
  const mm = Number(value.slice(3, 5));
  const yyyy = Number(value.slice(5, 9));
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) {
    return { ok: false, error: "В ИНН неверная дата рождения" };
  }
  if (d.getTime() > Date.now()) return { ok: false, error: "В ИНН дата рождения в будущем" };
  const birthDate = `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  return { ok: true, gender, birthDate };
}
