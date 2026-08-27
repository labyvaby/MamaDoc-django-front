import { describe, expect, it } from "vitest";

import { resolveHomeRoute } from "./homeRoute";

const context = (
  roleCode: string,
  permissions: string[],
  modules: string[] = [],
) => ({
  roleCode,
  can: (requested: string | string[]) => {
    const values = Array.isArray(requested) ? requested : [requested];
    return values.some((permission) => permissions.includes(permission));
  },
  canOpenModule: (module: "cleaning" | "documents" | "knowledge") =>
    modules.includes(module),
  hasActiveEmployee: true,
});

describe("resolveHomeRoute", () => {
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
