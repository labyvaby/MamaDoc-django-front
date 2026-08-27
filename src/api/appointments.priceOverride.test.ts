import { describe, expect, it } from "vitest";

import { normalizeAppointment } from "./appointments";

/**
 * Тумблер «разрешить врачу менять цену» у услуги (`allow_price_override`,
 * заказчик 20.08.2026). Строка приёма несёт снимок флага, по нему карточка
 * прячет иконку правки цены. Бэк деплоится первым, но фронт не должен
 * ломаться на окружении, где поля ещё нет.
 */
describe("normalizeAppointment — allowPriceOverride строки услуги", () => {
  it("пробрасывает false из ответа бэка", () => {
    const appt = normalizeAppointment({
      id: 1,
      organizationId: 1,
      serviceLines: [{ id: 10, allowPriceOverride: false }],
    });

    expect(appt.services[0].allowPriceOverride).toBe(false);
  });

  it("пробрасывает true из ответа бэка", () => {
    const appt = normalizeAppointment({
      id: 2,
      organizationId: 1,
      serviceLines: [{ id: 11, allowPriceOverride: true }],
    });

    expect(appt.services[0].allowPriceOverride).toBe(true);
  });

  it("без поля считает цену изменяемой — бэк ещё без тумблера", () => {
    const appt = normalizeAppointment({
      id: 3,
      organizationId: 1,
      serviceLines: [{ id: 12 }],
    });

    expect(appt.services[0].allowPriceOverride).toBe(true);
  });
});
