import { describe, it, expect } from "vitest";

import { buildAppointmentInvoiceHtml } from "./appointmentInvoice";
import type { DjangoAppointment } from "../../api/appointments";
import type { PaymentSummary } from "../../api/payments";

const appointment = {
  id: 105,
  organizationId: 1,
  branchId: 2,
  patient: { id: 9622, fullName: "Соловьёва Александра", phone: "550555209", photoUrl: null },
  scheduledAt: "2026-07-30T15:00:00+06:00",
  endsAt: "2026-07-30T15:30:00+06:00",
  isNight: false,
  status: "completed",
  complaints: null,
  doctorComplaints: null,
  adminComment: null,
  services: [
    {
      id: 1,
      service: { id: 7, name: "Первичный приём", basePrice: "1500.00", durationMinutes: 30, imageUrl: null },
      employee: { id: 3, fullName: "Зарифьян Анисья Ринатовна", photoUrl: null, nickname: null },
      price: "1500.00",
      lineTotal: "1500.00",
      durationMinutes: 30,
      quantity: 1,
      unitPrice: "1500.00",
      discountAmount: "0.00",
      consumptions: [
        {
          id: 11,
          productId: 4,
          name: "Шприц 5 мл",
          unit: "шт",
          quantity: "2",
          autoWriteOff: true,
          billable: true,
          unitPrice: "25.00",
          lineTotal: "50.00",
          source: "service_template",
          stockOnHand: "40",
          shortage: false,
          resultingStock: "38",
        },
        // Бесплатный расходник входит в цену услуги — в счёте его быть не должно.
        {
          id: 12,
          productId: 5,
          name: "Перчатки",
          unit: "пар",
          quantity: "1",
          autoWriteOff: true,
          billable: false,
          source: "service_template",
          stockOnHand: "10",
          shortage: false,
          resultingStock: "9",
        },
      ],
    },
  ],
  productLines: [],
  totalAmount: "1550.00",
  createdAt: "2026-07-30T14:00:00+06:00",
  updatedAt: "2026-07-30T14:00:00+06:00",
  consumptionWarnings: [],
} as unknown as DjangoAppointment;

const summary: PaymentSummary = {
  appointmentId: 105,
  totalAmount: "1550.00",
  discountAmount: "50.00",
  payableAmount: "1500.00",
  paidTotal: "1500.00",
  debt: "0.00",
  paymentStatus: "paid",
  payments: [
    { id: 1, method: "cash", amount: "1000.00", createdAt: "", cashDate: "2026-07-30" },
    { id: 2, method: "card", amount: "500.00", createdAt: "", cashDate: "2026-07-30", cashlessMethodName: "Бакай" },
  ],
};

function html() {
  return buildAppointmentInvoiceHtml({
    appointment,
    summary,
    patient: {
      id: 9622,
      fullName: "Соловьёва Александра",
      phone: "550555209",
      birthDate: "1974-06-03",
      address: "г. Бишкек, ул. Киевская 100",
    } as never,
    organizationName: "Клиника MamaDoc",
    branchName: "Центральный филиал",
    registrarName: "Таалайбекова Бегимай",
    createdByName: "Таалайбекова Бегимай",
  });
}

describe("счёт к оплате", () => {
  it("печатает услугу и её платный расходник, бесплатный — нет", () => {
    const out = html();
    expect(out).toContain("Первичный приём");
    expect(out).toContain("Шприц 5 мл");
    expect(out).not.toContain("Перчатки");
  });

  it("итоги берутся из сохранённой сводки оплат", () => {
    // toLocaleString("ru-RU") разделяет разряды неразрывным пробелом.
    const out = html().replace(/ /g, " ");
    expect(out).toContain("1 550,00"); // сумма
    expect(out).toContain("1 500,00"); // со скидкой / оплачено
    expect(out).toContain("Ноль сомов 00 тыйынов"); // сумма к оплате прописью
  });

  it("показывает способы оплаты с названием безнала", () => {
    expect(html()).toContain("Бакай");
  });

  it("экранирует данные пациента", () => {
    const out = buildAppointmentInvoiceHtml({
      appointment: {
        ...appointment,
        patient: { id: 1, fullName: "<script>alert(1)</script>", phone: "", photoUrl: null },
      } as DjangoAppointment,
      summary: null,
      patient: null,
      organizationName: "Клиника",
    });
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("без сводки считает итоги из полей приёма", () => {
    const out = buildAppointmentInvoiceHtml({
      appointment,
      summary: null,
      patient: null,
      organizationName: "Клиника",
    });
    // Оплат нет → вся сумма приёма к оплате.
    expect(out).toContain("Одна тысяча пятьсот пятьдесят сомов 00 тыйынов");
  });
});
