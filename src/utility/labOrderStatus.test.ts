import { describe, it, expect } from "vitest";

import { labOrderDispatchStatus, labOrderLisPrintBlockReason } from "./labOrderStatus";

describe("labOrderDispatchStatus", () => {
  it("отправленный заказ — зелёная метка", () => {
    expect(labOrderDispatchStatus(true)).toEqual({
      label: "Отправлен",
      color: "success",
    });
  });

  it("неотправленный заказ — жёлтая метка с другим текстом", () => {
    // Текст и цвет должны различаться от отправленного в обе стороны —
    // иначе регистратор не отличит зависший заказ от уехавшего (см.
    // lab-frontend-design.md, «Отказы»: перепутанные статусы стоят второго
    // оплаченного заказа).
    expect(labOrderDispatchStatus(false)).toEqual({
      label: "Оплачен, не отправлен",
      color: "warning",
    });
  });
});

describe("labOrderLisPrintBlockReason", () => {
  it("без номера в ЛИС печать штрихкода и регистрационного листа блокирована", () => {
    // Без lisOrderId запрос getLabOrderLabels обречён — печатать нечего, и
    // это надо сказать регистратору сразу, а не после отказа 502/404.
    expect(labOrderLisPrintBlockReason(null)).toBe(
      "Заказ не отправлен в ЛИС — печатать нечего",
    );
  });

  it("с номером в ЛИС причины блокировки нет", () => {
    expect(labOrderLisPrintBlockReason(883)).toBeNull();
  });
});
