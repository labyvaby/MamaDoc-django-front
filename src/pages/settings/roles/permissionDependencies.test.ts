import { describe, expect, it } from "vitest";

import { buildBaseCodeMap } from "./permissionDependencies";
import type { RbacPermission } from "../../../api/rbac";

/** Коды с прода (`/api/rbac/permissions/`), важные для правила зависимостей. */
const perm = (code: string, category = code.split(".")[0]): RbacPermission => ({
  id: 0,
  code,
  name: code,
  description: "",
  category,
  isActive: true,
});

const PERMISSIONS: RbacPermission[] = [
  perm("patients.view"),
  perm("patients.create"),
  perm("patients.update"),
  perm("patients.delete"),
  perm("patients.manage"),
  perm("catalog.view"),
  perm("catalog.manage", "content"),
  perm("tasks.read"),
  perm("tasks.create"),
  perm("deals.list"),
  perm("deals.update"),
  perm("appointments.view"),
  perm("appointments.view_all"),
  perm("payroll.view"),
  perm("payroll.view_own"),
  perm("finance.view"),
  perm("finance.view_history"),
  perm("attendance.view"),
  perm("attendance.clock"),
  perm("pos.view"),
  perm("pos.sell"),
  perm("notifications.manage"),
  perm("warehouse.view"),
  perm("warehouse.manage"),
  perm("warehouse.sales.view"),
  perm("warehouse.sales.manage"),
  perm("finance.cashbox.shift.close"),
];

describe("buildBaseCodeMap", () => {
  const map = buildBaseCodeMap(PERMISSIONS);

  it("привязывает действия к просмотру своего домена", () => {
    expect(map.get("patients.create")).toBe("patients.view");
    expect(map.get("patients.update")).toBe("patients.view");
    expect(map.get("patients.delete")).toBe("patients.view");
    expect(map.get("patients.manage")).toBe("patients.view");
  });

  it("берёт домен из кода, а не из категории", () => {
    // catalog.manage лежит в категории content, но зависит от catalog.view
    expect(map.get("catalog.manage")).toBe("catalog.view");
  });

  it("подхватывает read/list там, где нет view", () => {
    expect(map.get("tasks.create")).toBe("tasks.read");
    expect(map.get("deals.update")).toBe("deals.list");
  });

  it("не считает надстройкой сами разновидности просмотра", () => {
    expect(map.has("appointments.view_all")).toBe(false);
    expect(map.has("payroll.view_own")).toBe(false);
    expect(map.has("finance.view_history")).toBe(false);
  });

  it("не трогает точечные действия, которым просмотр раздела не нужен", () => {
    expect(map.has("attendance.clock")).toBe(false);
    expect(map.has("pos.sell")).toBe(false);
  });

  it("для вложенных прав берёт просмотр своего подраздела", () => {
    expect(map.get("warehouse.sales.manage")).toBe("warehouse.sales.view");
    expect(map.get("warehouse.manage")).toBe("warehouse.view");
  });

  it("не трогает действия за пределами списка write-суффиксов", () => {
    expect(map.has("finance.cashbox.shift.close")).toBe(false);
  });

  it("не выдумывает зависимость, когда права на просмотр в домене нет", () => {
    expect(map.has("notifications.manage")).toBe(false);
  });
});
