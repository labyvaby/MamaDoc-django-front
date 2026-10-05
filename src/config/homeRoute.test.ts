import { describe, expect, it } from "vitest";

import { resolveHomeRoute } from "./homeRoute";

const context = (
  roleCode: string,
  permissions: string[],
  modules: string[] = [],
  defaultHomeRoute?: string | null,
) => ({
  roleCode,
  can: (requested: string | string[]) => {
    const values = Array.isArray(requested) ? requested : [requested];
    return values.some((permission) => permissions.includes(permission));
  },
  canOpenModule: (module: "cleaning" | "documents" | "knowledge" | "realty") =>
    modules.includes(module),
  hasActiveEmployee: true,
  defaultHomeRoute,
});

describe("resolveHomeRoute", () => {
  it("застройщик с модулем realty начинает с шахматки, а не с Регистратуры", () => {
    const base = context("superadmin", ["appointments.registry.view"], ["realty"]);
    expect(resolveHomeRoute({ ...base, vertical: "realestate" })).toBe("/realestate/chessboard");
    // С правом на рабочий стол застройщик начинает с него (как макет AIVIO).
    const withDesk = context("sales", ["estate_dashboard.view", "realty.view"], ["realty"]);
    expect(resolveHomeRoute({ ...withDesk, vertical: "realestate" })).toBe("/realestate/dashboard");
    expect(resolveHomeRoute({ ...withDesk, vertical: "clinic" })).not.toBe("/realestate/dashboard");
    // Без модуля — обычный разбор по правам; клинике шахматка не подставляется.
    expect(resolveHomeRoute({ ...context("superadmin", ["appointments.registry.view"]), vertical: "realestate" })).toBe("/appointments");
    expect(resolveHomeRoute({ ...base, vertical: "clinic" })).toBe("/appointments");
  });

  it("opens the configured store POS when the employee has access", () => {
    expect(
      resolveHomeRoute(
        context(
          "manager",
          ["appointments.registry.view", "pos.view"],
          [],
          "/pos",
        ),
      ),
    ).toBe("/pos");
  });

  it("falls back when the configured store POS is unavailable", () => {
    expect(
      resolveHomeRoute(
        context("manager", ["appointments.registry.view"], [], "/pos"),
      ),
    ).toBe("/appointments");
  });

  it("opens the doctor room for a doctor, even when registry is also allowed", () => {
    expect(
      resolveHomeRoute(
        context("doctor", [
          "appointments.registry.view",
          "appointments.doctor_room.view",
        ]),
      ),
    ).toBe("/doctor");
  });

  it("opens the nurse room for a nurse", () => {
    expect(
      resolveHomeRoute(context("nurse", ["appointments.nurse_room.view"])),
    ).toBe("/nurse");
  });

  it.each(["manager", "administrator", "registrator", "accountant"])(
    "opens reception for %s",
    (role) => {
      expect(
        resolveHomeRoute(context(role, ["appointments.registry.view"])),
      ).toBe("/appointments");
    },
  );

  it("opens cleaning for a cleaner", () => {
    expect(resolveHomeRoute(context("cleaner", [], ["cleaning"]))).toBe(
      "/cleaning",
    );
  });

  it("supports custom roles by their actual permissions", () => {
    expect(resolveHomeRoute(context("lab_operator", ["tasks.list"]))).toBe(
      "/tasks",
    );
  });

  it("falls back to the always available profile instead of access denied", () => {
    expect(resolveHomeRoute(context("custom", []))).toBe("/profile");
  });
});
