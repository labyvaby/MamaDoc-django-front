import { describe, expect, it } from "vitest";

import {
  renderTemplatePreview,
  setupState,
  splitTemplateBody,
  type WhatsAppSetupInfo,
} from "./whatsapp";

describe("renderTemplatePreview", () => {
  it("подставляет значения по номеру плейсхолдера, как dry-run на бэке", () => {
    expect(
      renderTemplatePreview("Здравствуйте, {{1}}! Ждём вас {{2}} в {{3}}.", ["Айжан", "27.08", "15:30"]),
    ).toBe("Здравствуйте, Айжан! Ждём вас 27.08 в 15:30.");
  });

  it("отсутствующее значение рендерится пустой строкой", () => {
    expect(renderTemplatePreview("{{1}} и {{2}}", ["a"])).toBe("a и ");
    expect(renderTemplatePreview("без параметров", [])).toBe("без параметров");
  });

  it("не трогает именованные плейсхолдеры", () => {
    // Такие шаблоны MVP не поддерживает — но и ломать текст нельзя.
    expect(renderTemplatePreview("Привет, {{name}}", ["x"])).toBe("Привет, {{name}}");
  });
});

describe("splitTemplateBody", () => {
  it("режет текст на куски и плейсхолдеры с их номерами", () => {
    expect(splitTemplateBody("Здравствуйте, {{1}}! {{2}}")).toEqual([
      { kind: "text", text: "Здравствуйте, " },
      { kind: "placeholder", index: 1 },
      { kind: "text", text: "! " },
      { kind: "placeholder", index: 2 },
    ]);
  });

  it("текст без плейсхолдеров — один кусок; пустой — ничего", () => {
    expect(splitTemplateBody("просто текст")).toEqual([{ kind: "text", text: "просто текст" }]);
    expect(splitTemplateBody("")).toEqual([]);
  });
});

describe("setupState", () => {
  const setup = (overrides: Partial<WhatsAppSetupInfo> = {}): WhatsAppSetupInfo => ({
    appId: "123",
    webhookUrl: "https://raven/api/v1/webhooks/whatsapp/acc",
    webhookVerifyToken: "tok",
    webhookRegistered: true,
    webhookRegisteredAt: "2026-09-16T09:00:01Z",
    webhookConfirmed: true,
    webhookVerifiedAt: "2026-09-16T09:00:02Z",
    webhookError: "",
    appSubscribed: true,
    appSubscribedAt: "2026-09-16T09:00:03Z",
    appSubscriptionError: "",
    ...overrides,
  });

  it("подтверждено — только когда Meta прошла проверку URL и приложение подписано", () => {
    expect(setupState(setup())).toBe("confirmed");
    expect(setupState(setup({ appSubscribed: false, appSubscribedAt: null }))).toBe("pending");
  });

  it("ошибка любого шага — «не удалось», пока вебхук не подтверждён", () => {
    expect(
      setupState(setup({ webhookConfirmed: false, webhookError: "(#2200) verification failed" })),
    ).toBe("failed");
    expect(
      setupState(setup({ appSubscribed: false, appSubscriptionError: "(#100) permission" })),
    ).toBe("failed");
  });

  it("без данных о настройке — «в процессе», а не ошибка", () => {
    expect(setupState(undefined)).toBe("pending");
    expect(setupState(setup({ webhookConfirmed: false, webhookRegistered: false }))).toBe("pending");
  });
});
