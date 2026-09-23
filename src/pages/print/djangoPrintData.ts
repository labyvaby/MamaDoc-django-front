import dayjs from "dayjs";

import { getAppointment, type DjangoAppointment } from "../../api/appointments";
import { getPatient } from "../../api/patients";
import {
  getConclusionSlots,
  slotConclusions,
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
 * Patient DOB is fetched separately — the appointment's short patient shape
 * does not carry birthDate.
 */
export interface DjangoPrintData {
  appt: DjangoAppointment;
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
  const [appt, slots] = await Promise.all([
    getAppointment(appointmentId),
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

  let patientDob = "—";
  const patientId = appt.patient?.id;
  if (patientId != null) {
    try {
      const p = await getPatient(patientId);
      patientDob = p.birthDate ? dayjs(p.birthDate).format("DD.MM.YYYY") : "—";
    } catch {
      patientDob = "—";
    }
  }

  return {
    appt,
    slot,
    conclusion: picked?.conclusion ?? slot?.conclusion ?? null,
    patientFio: appt.patient?.fullName ?? "Неизвестно",
    patientDob,
    doctorFio: slot?.doctor?.fullName ?? "Не указан",
  };
}
