import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Единая точка правды о том, что создаёт бэк-команда `seed_e2e_org`
 * (MamaDoc-backend/server/apps/main/management/commands/seed_e2e_org.py).
 * Меняешь имя там — меняешь здесь.
 */

// Абсолютный путь: config читает storageState относительно своей папки,
// setup пишет относительно cwd — одна константа снимает расхождение.
// package.json: "type": "module", поэтому import.meta.url доступен.
const e2eDir = dirname(dirname(fileURLToPath(import.meta.url)));
export const ADMIN_STORAGE_STATE = resolve(e2eDir, "test-results/.auth/admin.json");

export const creds = {
  admin: {
    username: "e2e-admin",
    password: process.env.E2E_ADMIN_PASSWORD ?? "",
  },
  doctor: {
    username: "e2e-doctor",
    password: process.env.E2E_DOCTOR_PASSWORD ?? "",
  },
} as const;

export const seed = {
  org: { name: "E2E Clinic", slug: "e2e-clinic" },
  branch: { name: "Главный" },
  roles: { manager: "Управляющий", doctor: "Врач" },
  doctor: { fullName: "Тестов Доктор Сидович", phone: "+996700900002" },
} as const;

/**
 * Уникальный суффикс на прогон: тесты в одном прогоне не должны создавать
 * сотрудников с одинаковым телефоном (телефон = логин на бэке).
 * Формат: 9 цифр KG-номера, начиная с 700 9xx xxx — не пересекается с сидом.
 */
export function uniquePhoneLocal(): string {
  const n = Math.floor(Math.random() * 100_000);
  return `7009${String(n).padStart(5, "0")}`;
}
