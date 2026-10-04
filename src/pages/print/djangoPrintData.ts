import dayjs from "dayjs";

import {
  getConclusionContext,
  getConclusionSlots,
  slotConclusions,
  type ConclusionContext,
  type ConclusionSlot,
  type MedicalConclusion,
} from "../../api/medical";

/**
 * Shared loader for the Django-mode print pages (conclusion + certificate).
 *
 * Conclusions are per service line, so the print target is identified by
 * ``lineId`` (serviceLineId). When omitted, falls back to the first slot that
 * has a conclusion. A line may carry several conclusions (documents, since
 * 22.09.2026): ``conclusionId`` picks one, without it the first is printed.
 *
 * ⚠ Patient, date and complaints come from ``conclusion-context``, never from
 * the appointment card: a doctor without ``appointments.view_all`` is refused
 * a colleague's card (404 «Appointment not found» — it carries prices), yet
 * may read and print that colleague's conclusion from the patient's history.
 * Loading the card broke exactly that print (24.09.2026).
 */
export interface DjangoPrintData {
  visit: ConclusionContext;
  slot: ConclusionSlot | undefined;
  conclusion: MedicalConclusion | null;
  patientFio: string;
  patientDob: string;
  doctorFio: string;
}

/** Цель печати из адреса: строка услуги и, если документов несколько, заключение. */
export function readPrintTarget(): { lineId: number | null; conclusionId: number | null } {
  const params = new URLSearchParams(window.location.search);
  const num = (key: string) => {
    const raw = params.get(key);
    return raw ? Number(raw) : null;
  };
  return { lineId: num("lineId"), conclusionId: num("conclusionId") };
}

export async function loadDjangoPrintData(
  appointmentId: number,
  lineId: number | null,
  conclusionId: number | null = null,
): Promise<DjangoPrintData> {
  const [visit, slots] = await Promise.all([
    getConclusionContext(appointmentId),
    getConclusionSlots(appointmentId),
  ]);

  const picked =
    conclusionId != null
      ? slots
          .flatMap((s) => slotConclusions(s).map((c) => ({ slot: s, conclusion: c })))
          .find((entry) => entry.conclusion.id === conclusionId)
      : undefined;

  const slot =
    picked?.slot ??
    (lineId != null ? slots.find((s) => s.serviceLineId === lineId) : undefined) ??
    slots.find((s) => s.conclusion != null) ??
    slots[0];

  const birthDate = visit.patient?.birthDate;

  return {
    visit,
    slot,
    conclusion: picked?.conclusion ?? slot?.conclusion ?? null,
    patientFio: visit.patient?.fullName ?? "Неизвестно",
    patientDob: birthDate ? dayjs(birthDate).format("DD.MM.YYYY") : "—",
    doctorFio: slot?.doctor?.fullName ?? "Не указан",
  };
}
