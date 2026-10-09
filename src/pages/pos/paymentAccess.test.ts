import { describe, expect, it } from "vitest";

import { hasNoMoneyMethods, moneyAccessNote } from "./paymentAccess";

describe("доступ к способам оплаты", () => {
  it("хотя бы один денежный способ — подсказки нет", () => {
    expect(hasNoMoneyMethods({ cash: true, debt: true })).toBe(false);
    expect(moneyAccessNote({ cashless: true })).toBeNull();
  });

  it("только «в долг» — объясняем, что наличные, карта и QR не выданы роли", () => {
    const note = moneyAccessNote({ cash: false, card: false, cashless: false, debt: true });
    expect(note?.title).toBe("Наличные, карта и QR недоступны вашей роли");
    expect(note?.text).toMatch(/^Сейчас можно оформить только в долг\./);
    expect(note?.text).toMatch(/наличная оплата/);
  });

  it("ни одного способа — принять оплату нечем", () => {
    expect(moneyAccessNote({})?.text).toMatch(/^Принять оплату сейчас нечем\./);
    expect(moneyAccessNote({ debt: true, certificate: true })?.text).toMatch(/в долг или сертификатом/);
  });
});
