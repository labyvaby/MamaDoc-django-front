import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import type { ConclusionSlot, MedicalConclusion } from "../../api/medical";

/**
 * Печать заключения коллеги (регрессия 24.09.2026, «Мама Доктор»).
 *
 * Врач без права «видеть все приёмы» открывает в карточке пациента заключение
 * коллеги и жмёт «Печать». Карточку приёма `/appointments/<id>/` бэк ему не
 * отдаёт — 404 «Appointment not found», в ней цены и оплаты, — а заключения
 * отдаёт. Страница печати падала на карточке. Шапка документа должна браться
 * из `conclusion-context`: он открыт ровно тем, кому открыты заключения.
 */

const apiRequest = vi.fn();
vi.mock("../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/client")>();
  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});

const { loadDjangoPrintData } = await import("./djangoPrintData");

const APPOINTMENT_ID = 23021;
const LINE_ID = 25810;

function conclusion(id: number, text: string): MedicalConclusion {
  return {
    id,
    serviceLineId: LINE_ID,
    appointmentId: APPOINTMENT_ID,
    complaints: "",
    anamnesis: "",
    objective: "",
    conclusion: text,
    diagnosisData: [],
    photoUrls: [],
    weightKg: null,
    heightCm: null,
    temperature: null,
    internalComment: null,
    status: "completed",
    formData: null,
    createdAt: "2026-09-24T04:56:41Z",
    updatedAt: "2026-09-24T04:56:41Z",
  };
}

const SLOT: ConclusionSlot = {
  serviceLineId: LINE_ID,
  service: { id: 1, name: "Первичный прием", basePrice: "1000.00", requiresConclusion: true },
  doctor: { id: 9, fullName: "Адылбекова Алина Адылбековна" },
  requiresConclusion: true,
  state: "completed",
  conclusion: conclusion(9434, "Первый документ"),
  conclusions: [conclusion(9434, "Первый документ"), conclusion(9500, "Протокол УЗИ")],
  canEdit: false,
  canPrint: true,
};

const CONTEXT = {
  appointmentId: APPOINTMENT_ID,
  startsAt: "2026-09-24T04:30:00Z",
  complaints: "Кашель",
  doctorComplaints: "Кашель третий день",
  patient: { id: 19686, fullName: "Луиза Пациентова", birthDate: "2019-05-17" },
};

/** Бэк так, как он отвечает врачу на приём коллеги. */
function colleagueBackend(context: unknown = CONTEXT) {
  apiRequest.mockImplementation(async (path: string) => {
    if (path === `/appointments/${APPOINTMENT_ID}/`) {
      throw new ApiError("Appointment not found", 404, {
        error: { code: "NOT_FOUND", message: "Appointment not found", details: null },
      });
    }
    if (path === `/appointments/${APPOINTMENT_ID}/conclusion-slots/`) return [SLOT];
    if (path === `/appointments/${APPOINTMENT_ID}/conclusion-context/`) return context;
    throw new Error(`unexpected request ${path}`);
  });
}

describe("loadDjangoPrintData", () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it("печатает заключение коллеги, хотя карточка приёма ему закрыта", async () => {
    colleagueBackend();

    const data = await loadDjangoPrintData(APPOINTMENT_ID, LINE_ID, 9500);

    expect(data.patientFio).toBe("Луиза Пациентова");
    expect(data.patientDob).toBe("17.05.2019");
    expect(data.visit.startsAt).toBe("2026-09-24T04:30:00Z");
    expect(data.visit.complaints).toBe("Кашель");
    expect(data.visit.doctorComplaints).toBe("Кашель третий день");
    expect(data.doctorFio).toBe("Адылбекова Алина Адылбековна");
    expect(data.conclusion?.id).toBe(9500);
    expect(apiRequest).not.toHaveBeenCalledWith(`/appointments/${APPOINTMENT_ID}/`);
  });

  it("приём без пациента и без даты рождения печатается с заглушками", async () => {
    colleagueBackend({ ...CONTEXT, patient: null });

    const data = await loadDjangoPrintData(APPOINTMENT_ID, LINE_ID);

    expect(data.patientFio).toBe("Неизвестно");
    expect(data.patientDob).toBe("—");
    expect(data.conclusion?.id).toBe(9434);
  });
});
