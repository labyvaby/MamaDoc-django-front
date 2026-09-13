import { describe, expect, it } from "vitest";

import { renderTemplatePreview, splitTemplateBody } from "./whatsapp";

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
