import { describe, expect, it } from "vitest";

import { buildGuestMessage, whatsappDigits, whatsappLink } from "./hotelGuestMessages";
import type { HotelProperty, HotelReservation } from "../api/hotel";

describe("whatsappDigits", () => {
  it("местный номер КР приводит к коду страны", () => {
    expect(whatsappDigits("0555 111 002")).toBe("996555111002");
    expect(whatsappDigits("555111002")).toBe("996555111002");
    expect(whatsappDigits("+996 (555) 11-10-02")).toBe("996555111002");
    expect(whatsappDigits("+7 916 123 45 67")).toBe("79161234567");
  });

  it("без телефона ссылки нет", () => {
    expect(whatsappLink("")).toBeNull();
    expect(whatsappLink("123")).toBeNull();
    expect(whatsappLink("+996555111002", "Привет")).toBe("https://wa.me/996555111002?text=%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82");
  });
});

describe("buildGuestMessage", () => {
  const property = { name: "Viva — центр", address: "Бишкек, Токтогула 120", phone: "+996312900100", checkInTime: "14:00:00", checkOutTime: "12:00:00" } as HotelProperty;
  const reservation = {
    number: 14,
    customerName: "Айгерим Бекова",
    currency: "KGS",
    totalAmount: "8400.00",
    paidAmount: "2000.00",
    balanceDue: "6400.00",
    items: [{ roomTypeName: "Делюкс", checkIn: "2026-10-05", checkOut: "2026-10-07", guests: [{ isPrimary: true, fullName: "Айгерим Бекова", phone: "+996555111002" }] }],
  } as unknown as HotelReservation;

  it("подтверждение — даты, номер, суммы и время заезда", () => {
    const text = buildGuestMessage("confirmation", reservation, property);
    expect(text).toContain("Здравствуйте, Айгерим Бекова!");
    expect(text).toContain("бронь №14 в Viva — центр подтверждена");
    expect(text).toContain("2 ночи");
    expect(text).toContain("к оплате 6");
    expect(text).toContain("Заезд с 14:00, выезд до 12:00");
  });

  it("остаток к оплате", () => {
    expect(buildGuestMessage("balance", reservation, property)).toContain("к оплате 6");
  });
});
