import { describe, expect, it } from "vitest";

import "../i18n";
import { setCurrentGlossary } from "../i18n/glossary";
import {
  getStatusConfig,
  getStatusLabel,
  normalizeDjangoStatus,
  resolveStatusCode,
  DJANGO_STATUS_LABEL,
  APPOINTMENT_STATUSES,
  type StatusCode,
} from "./appointmentStatuses";

/**
 * Метки статусов зависят от вертикали, поэтому цвет и иконка подбираются по
 * каноническому коду, а не по русской строке. Тест фиксирует и резолв кода,
 * и то, что цвета не изменились относительно прежнего поведения.
 */

describe("resolveStatusCode", () => {
  const cases: [string, StatusCode][] = [
    // Django-слаги
    ["scheduled", "scheduled"],
    ["confirmed", "confirmed"],
    ["arrived", "arrived"],
    ["in_progress", "in_progress"],
    ["completed", "completed"],
    ["canceled", "canceled"],
    ["no_show", "no_show"],
    // алиасы слагов
    ["waiting", "arrived"],
    ["cancelled", "canceled"],
    // legacy-значения Supabase (русские строки в данных)
    [APPOINTMENT_STATUSES.EXPECTED, "scheduled"],
    [APPOINTMENT_STATUSES.CONFIRMED, "confirmed"],
    [APPOINTMENT_STATUSES.PATIENT_ARRIVED, "arrived"],
    [APPOINTMENT_STATUSES.IN_PROGRESS, "in_progress"],
    [APPOINTMENT_STATUSES.COMPLETED, "completed"],
    [APPOINTMENT_STATUSES.CANCELLED, "canceled"],
    [APPOINTMENT_STATUSES.PATIENT_NOT_CAME, "no_show"],
    [APPOINTMENT_STATUSES.PAID, "paid"],
    [APPOINTMENT_STATUSES.PARTIALLY_PAID, "partially_paid"],
    [APPOINTMENT_STATUSES.DISCOUNTED, "discounted"],
    [APPOINTMENT_STATUSES.FREE, "free"],
    // исторические варианты написания
    ["Подтвержден", "confirmed"],
    ["в очереди", "arrived"],
    ["Завершён", "completed"],
    ["Отменен", "canceled"],
    ["оплачено безналом", "paid_cashless"],
  ];

  it.each(cases)("«%s» → %s", (input, expected) => {
    expect(resolveStatusCode(input)).toBe(expected);
  });

  it("не ломается на мусоре", () => {
    expect(resolveStatusCode(null)).toBeNull();
    expect(resolveStatusCode(undefined)).toBeNull();
    expect(resolveStatusCode(42)).toBeNull();
    expect(resolveStatusCode("что-то новое с бэка")).toBeNull();
  });
});

describe("канонические коды резолвятся сами в себя", () => {
  // Иначе getStatusConfig("paid") вернёт метку «paid» вместо «Оплачено»:
  // платёжные коды передаются в конфиг напрямую из списка приёмов.
  const codes: StatusCode[] = [
    "scheduled",
    "confirmed",
    "arrived",
    "in_progress",
    "completed",
    "canceled",
    "no_show",
    "paid",
    "partially_paid",
    "paid_cashless",
    "discounted",
    "free",
    "debt",
  ];

  it.each(codes)("%s", (code) => {
    expect(resolveStatusCode(code)).toBe(code);
    // и метка не равна самому коду — значит нашлась в словаре
    expect(getStatusLabel(code)).not.toBe(code);
  });
});

describe("getStatusConfig — цвета не изменились", () => {
  const expectedColors: [string, string][] = [
    ["canceled", "error"],
    ["confirmed", "info"],
    ["arrived", "success"],
    ["completed", "default"],
    ["no_show", "default"],
    ["in_progress", "warning"],
    ["scheduled", "warning"],
    [APPOINTMENT_STATUSES.PAID, "success"],
    [APPOINTMENT_STATUSES.PARTIALLY_PAID, "purple"],
    [APPOINTMENT_STATUSES.DISCOUNTED, "secondary"],
    [APPOINTMENT_STATUSES.FREE, "success"],
    ["оплачено безналом", "info"],
  ];

  it.each(expectedColors)("«%s» → цвет %s", (status, color) => {
    expect(getStatusConfig(status).color).toBe(color);
  });

  it("неизвестный статус получает дефолтный жёлтый и показывается как есть", () => {
    const cfg = getStatusConfig("новый статус с бэка");
    expect(cfg.color).toBe("warning");
    expect(cfg.label).toBe("новый статус с бэка");
  });
});

describe("метки зависят от вертикали", () => {
  it("clinic говорит «пациент»", () => {
    setCurrentGlossary("clinic");
    expect(getStatusLabel("arrived")).toBe("Пациент здесь");
    expect(getStatusLabel("no_show")).toBe("Пациент не пришел");
    expect(normalizeDjangoStatus("arrived")).toBe("Пациент здесь");
    expect(DJANGO_STATUS_LABEL.arrived).toBe("Пациент здесь");
  });

  it("beauty говорит «клиент»", () => {
    setCurrentGlossary("beauty");
    expect(getStatusLabel("arrived")).toBe("Клиент здесь");
    expect(getStatusLabel("no_show")).toBe("Клиент не пришел");
    expect(normalizeDjangoStatus("arrived")).toBe("Клиент здесь");
    expect(DJANGO_STATUS_LABEL.arrived).toBe("Клиент здесь");
  });

  it("статусы без терминов одинаковы в обеих вертикалях", () => {
    setCurrentGlossary("clinic");
    const clinic = getStatusLabel("completed");
    setCurrentGlossary("beauty");
    expect(getStatusLabel("completed")).toBe(clinic);
    expect(clinic).toBe("Завершено");
  });

  // Возврат к дефолту, чтобы не влиять на другие тест-файлы.
  it("сброс на clinic", () => {
    setCurrentGlossary("clinic");
    expect(getStatusLabel("arrived")).toBe("Пациент здесь");
  });
});

describe("двойное преобразование slug → метка → конфиг", () => {
  // По коду встречается getStatusConfig(normalizeDjangoStatus(status)).
  // Метка терминологична, поэтому резолв обязан узнавать её обратно —
  // иначе в салоне «Клиент здесь» потерял бы зелёный цвет.
  const doublePass = (slug: string) => getStatusConfig(normalizeDjangoStatus(slug));

  it.each(["clinic", "beauty"] as const)("в вертикали %s цвет сохраняется", (vertical) => {
    setCurrentGlossary(vertical);
    expect(doublePass("arrived").color).toBe("success");
    expect(doublePass("canceled").color).toBe("error");
    expect(doublePass("confirmed").color).toBe("info");
    expect(doublePass("no_show").color).toBe("default");
    expect(doublePass("in_progress").color).toBe("warning");
  });

  it("метка после двойного преобразования не задваивается", () => {
    setCurrentGlossary("beauty");
    expect(doublePass("arrived").label).toBe("Клиент здесь");
    setCurrentGlossary("clinic");
    expect(doublePass("arrived").label).toBe("Пациент здесь");
  });
});
