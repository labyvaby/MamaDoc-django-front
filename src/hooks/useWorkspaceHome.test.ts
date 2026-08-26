import { describe, expect, it } from "vitest";

import { resolveWorkspaceHome } from "./useWorkspaceHome";

/**
 * Экран «Нет доступа» сразу после входа: врач попадал на Регистратуру
 * (`/appointments`), права `appointments.registry.view` у него нет. Здесь
 * фиксируется, что главная выбирается по правам, а не хардкодом.
 */

const canOf = (granted: string[]) => (permission: string | string[]) => {
  const perms = Array.isArray(permission) ? permission : [permission];
  return perms.some((p) => granted.includes(p));
};

const home = (granted: string[], loading = false) =>
  resolveWorkspaceHome(canOf(granted), loading).workspacePath;

describe("главная страница по правам", () => {
  it("регистратор — Регистратура", () => {
    expect(home(["appointments.view", "appointments.registry.view"])).toBe("/appointments");
  });

  it("врач — Кабинет врача, а не Регистратура", () => {
    expect(home(["appointments.view", "appointments.doctor_room.view"])).toBe("/doctor");
  });

  it("медсестра — Процедурный кабинет", () => {
    expect(home(["appointments.view", "appointments.nurse_room.view"])).toBe("/nurse");
  });

  it("Регистратура приоритетнее кабинетов, если право есть", () => {
    expect(
      home(["appointments.registry.view", "appointments.doctor_room.view"]),
    ).toBe("/appointments");
  });

  it("без рабочих пространств — null (вызывающий ведёт на «Сводку»)", () => {
    expect(home(["appointments.view"])).toBeNull();
  });

  it("права ещё грузятся — null, редиректить рано", () => {
    expect(home(["appointments.registry.view"], true)).toBeNull();
  });
});
