import { describe, expect, it } from "vitest";

import { ApiError } from "./client";
import {
  findReplacementSlot,
  isServiceLineGoneError,
  type ConclusionSlot,
} from "./medical";

/**
 * Строку услуги приёма правка приёма не меняет, а пересоздаёт: смена услуги
 * или исполнителя шлёт строку без id, бэк удаляет старую и создаёт новую
 * (проверено на живом API 16.08.2026: 14551 → 14552). Форма заключения,
 * открытая до этого, держит мёртвый id и получает 404 «Service line not
 * found» — эти две функции нужны, чтобы вместо ошибки перепривязаться.
 */

const slot = (over: Partial<ConclusionSlot> & { serviceLineId: number }): ConclusionSlot => ({
  service: { id: 190, name: "Пальчикование", basePrice: "500.00", requiresConclusion: true },
  doctor: { id: 41, fullName: "Nursultan Doctor" },
  requiresConclusion: true,
  state: "not_created",
  conclusion: null,
  canEdit: true,
  canPrint: false,
  ...over,
});

describe("isServiceLineGoneError", () => {
  it("узнаёт 404 «Service line not found»", () => {
    const err = new ApiError("Service line not found", 404, null);
    expect(isServiceLineGoneError(err)).toBe(true);
  });

  it("не путает с другими 404 и с прочими статусами", () => {
    expect(isServiceLineGoneError(new ApiError("Page not found", 404, null))).toBe(false);
    expect(isServiceLineGoneError(new ApiError("Service line not found", 400, null))).toBe(false);
    expect(isServiceLineGoneError(new Error("Service line not found"))).toBe(false);
  });
});

describe("findReplacementSlot", () => {
  it("находит пересозданную строку той же услуги и того же врача", () => {
    const slots = [slot({ serviceLineId: 14552 })];
    expect(
      findReplacementSlot(slots, { serviceLineId: 14551, serviceId: 190, doctorId: 41 })
        ?.serviceLineId,
    ).toBe(14552);
  });

  it("не берёт чужую услугу и чужого исполнителя", () => {
    const slots = [
      slot({ serviceLineId: 14553, service: { id: 34, name: "Чек ап", basePrice: "0", requiresConclusion: true } }),
      slot({ serviceLineId: 14554, doctor: { id: 77, fullName: "Другой врач" } }),
    ];
    expect(findReplacementSlot(slots, { serviceLineId: 14551, serviceId: 190, doctorId: 41 })).toBeNull();
  });

  it("пропускает строку без права на правку и саму исходную строку", () => {
    const slots = [
      slot({ serviceLineId: 14551 }),
      slot({ serviceLineId: 14555, canEdit: false }),
    ];
    expect(findReplacementSlot(slots, { serviceLineId: 14551, serviceId: 190, doctorId: 41 })).toBeNull();
  });

  it("не требует совпадения по врачу, когда врач строки неизвестен", () => {
    const slots = [slot({ serviceLineId: 14556, doctor: null })];
    expect(
      findReplacementSlot(slots, { serviceLineId: 14551, serviceId: 190, doctorId: null })
        ?.serviceLineId,
    ).toBe(14556);
  });
});
