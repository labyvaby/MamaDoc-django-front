import { describe, expect, it } from "vitest";

import { buildAutoDescription, describeSteps, pageTitleFor } from "./autoDescription";
import { sanitizePath, type Problem } from "./diagnosticsRecorder";
import { formatBytes, formatRelative } from "./meta";

const apiProblem = (over: Partial<Problem> = {}): Problem => ({
  kind: "api",
  at: 1,
  status: 500,
  code: "INTERNAL_ERROR",
  method: "POST",
  endpoint: "/api/appointments/",
  traceId: "abc123",
  message: "boom",
  ...over,
});

describe("sanitizePath", () => {
  it("оставляет путь и имена параметров, но не их значения", () => {
    expect(sanitizePath("/api/appointments/?date=2026-10-01&search=Иван")).toBe(
      "/api/appointments/?date&search",
    );
  });

  it("путь без параметров не меняет", () => {
    expect(sanitizePath("/api/auth/me/")).toBe("/api/auth/me/");
  });
});

describe("pageTitleFor", () => {
  it("находит страницу по началу пути, длинные префиксы раньше коротких", () => {
    expect(pageTitleFor("/settings/roles")).toBe("Настройки · Роли");
    expect(pageTitleFor("/settings/branches")).toBe("Настройки");
    expect(pageTitleFor("/appointments?date=1")).toBe("Регистратура");
    expect(pageTitleFor("/pos/history")).toBe("История продаж");
  });

  it("неизвестный путь — пустая строка", () => {
    expect(pageTitleFor("/something-new")).toBe("");
  });
});

describe("describeSteps", () => {
  it("складывает маршруты и нажатия в цепочку", () => {
    const steps = describeSteps([
      { type: "route", label: "/appointments" },
      { type: "click", label: "button[Записать]" },
      { type: "click", label: "button[Сохранить]" },
    ]);
    expect(steps).toBe("Открыл «Регистратура» → нажал «Записать» → нажал «Сохранить»");
  });

  it("не выдаёт поля ввода и элементы списков за нажатые кнопки", () => {
    const steps = describeSteps([
      { type: "click", label: "input[phone]" },
      { type: "click", label: "div(в списке)" },
      { type: "click", label: "button[#save]" },
    ]);
    expect(steps).toBe("");
  });
});

describe("buildAutoDescription", () => {
  it("без недавнего сбоя оставляет заголовок и описание пустыми", () => {
    const result = buildAutoDescription(null, "/appointments", []);
    expect(result.title).toBe("");
    expect(result.description).toBe("");
  });

  it("ошибка сервера: страница, последняя кнопка, статус и код для разработчиков", () => {
    const result = buildAutoDescription(apiProblem(), "/appointments", [
      { type: "click", label: "button[Сохранить]" },
    ]);
    expect(result.title).toBe("Ошибка на странице «Регистратура»");
    expect(result.description).toContain("после нажатия «Сохранить»");
    expect(result.description).toContain("на сервере произошла ошибка (ошибка 500)");
    expect(result.description).toContain("abc123");
  });

  it("обрыв связи и падение интерфейса описываются по-своему", () => {
    const offline = buildAutoDescription(apiProblem({ kind: "network", status: 0 }), "/tasks", []);
    expect(offline.title).toBe("Пропала связь с сервером");
    const react = buildAutoDescription(apiProblem({ kind: "react", status: null }), "/tasks", []);
    expect(react.title).toBe("Страница «Задачи» перестала открываться");
  });
});

describe("formatters", () => {
  it("относительное время: только что / минуты / дни", () => {
    const now = new Date("2026-10-03T12:00:00Z").getTime();
    expect(formatRelative("2026-10-03T11:59:50Z", now)).toBe("только что");
    expect(formatRelative("2026-10-03T11:30:00Z", now)).toContain("минут");
    expect(formatRelative("2026-09-29T12:00:00Z", now)).toContain("дн");
    expect(formatRelative("2026-08-01T12:00:00Z", now)).toContain("2026");
  });

  it("размер файла", () => {
    expect(formatBytes(512)).toBe("512 Б");
    expect(formatBytes(2048)).toBe("2 КБ");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 МБ");
  });
});
