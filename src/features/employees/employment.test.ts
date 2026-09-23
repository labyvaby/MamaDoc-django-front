import { describe, expect, it } from "vitest";

import {
  formatFiredNote,
  planStatusSave,
  restoreOutcomeMessage,
} from "./employment";

/**
 * Уволенного возвращают отдельной ручкой: PATCH одного статуса оставлял бы
 * человека «Активным» в карточке и без доступа в систему — именно так
 * увольнение и оказалось необратимым.
 */
describe("planStatusSave — что делать со статусом при сохранении", () => {
  it("уволенного переводят в «Работает» → восстановление, желаемый статус передаём", () => {
    // Досылать ли его PATCH-ем, решает форма по ответу восстановления:
    // бэк возвращает статус, что был до увольнения.
    expect(planStatusSave("fired", "active")).toEqual({
      restore: true,
      patchStatus: "active",
    });
  });

  it("уволенного переводят в «Не работает» → восстановление + желаемый inactive", () => {
    expect(planStatusSave("fired", "inactive")).toEqual({
      restore: true,
      patchStatus: "inactive",
    });
  });

  it("карточку уволенного сохранили как есть → ничего со статусом не делаем", () => {
    expect(planStatusSave("fired", "fired")).toEqual({ restore: false });
  });

  it("обычное переключение работает/не работает — простой PATCH", () => {
    expect(planStatusSave("active", "inactive")).toEqual({
      restore: false,
      patchStatus: "inactive",
    });
  });

  it("статус не меняли — поле не шлём (иначе PATCH трогает лишнее)", () => {
    expect(planStatusSave("active", "active")).toEqual({ restore: false });
  });
});

describe("formatFiredNote — подпись «кем и когда уволен»", () => {
  it("есть дата и имя", () => {
    expect(
      formatFiredNote({
        firedAt: "2026-09-22T07:09:31Z",
        firedBy: "Бахтибаева Нуржан",
        restoredAt: null,
        restoredBy: "",
      }),
    ).toBe("22.09.2026 · Бахтибаева Нуржан");
  });

  it("имени нет (увольняли до журнала) — только дата", () => {
    expect(
      formatFiredNote({
        firedAt: "2026-09-22T07:09:31Z",
        firedBy: "",
        restoredAt: null,
        restoredBy: "",
      }),
    ).toBe("22.09.2026");
  });

  it("журнала нет вовсе — подписи нет", () => {
    expect(formatFiredNote(null)).toBe("");
    expect(formatFiredNote(undefined)).toBe("");
  });
});

describe("restoreOutcomeMessage — уведомление ровно о том, что вернулось", () => {
  it("уволен до журнала — честно просим выдать доступ и услуги вручную", () => {
    const m = restoreOutcomeMessage(
      { fromJournal: false, accessRestored: false, servicesRestored: 0 },
      "Максатбеков Нурзат",
    );
    expect(m.message).toContain("вручную");
    expect(m.message).toContain("Максатбеков Нурзат");
  });

  it("по журналу — перечисляем, что вернулось", () => {
    const m = restoreOutcomeMessage(
      { fromJournal: true, accessRestored: true, servicesRestored: 3 },
      "Иванова",
    );
    expect(m.message).toBe(
      "Сотрудник Иванова восстановлен: вернулись доступ в систему и услуги (3).",
    );
  });

  it("по журналу, но возвращать было нечего — без выдуманных подробностей", () => {
    const m = restoreOutcomeMessage(
      { fromJournal: true, accessRestored: false, servicesRestored: 0 },
      "",
    );
    expect(m.message).toBe("Сотрудник восстановлен.");
  });
});
