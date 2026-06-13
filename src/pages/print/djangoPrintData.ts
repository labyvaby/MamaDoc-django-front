import dayjs from "dayjs";

import { getAppointment, type DjangoAppointment } from "../../api/appointments";
import { getPatient } from "../../api/patients";
import {
  getConclusionSlots,
  type ConclusionSlot,
  type MedicalConclusion,
} from "../../api/medical";

/**
 * Shared loader for the Django-mode print pages (conclusion + certificate).
 *
 * Conclusions are per service line, so the print target is identified by
 * ``lineId`` (serviceLineId). When omitted, falls back to the first slot that
 * has a conclusion. Patient DOB is fetched separately — the appointment's
 * short patient shape does not carry birthDate.
 */
export interface DjangoPrintData {
  appt: DjangoAppointment;
  slot: ConclusionSlot | undefined;
  conclusion: MedicalConclusion | null;
  patientFio: string;
  patientDob: string;
  doctorFio: string;
}

export async function loadDjangoPrintData(
  appointmentId: number,
  lineId: number | null,
): Promise<DjangoPrintData> {
  const [appt, slots] = await Promise.all([
    getAppointment(appointmentId),
    getConclusionSlots(appointmentId),
  ]);

  const slot =
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
    conclusion: slot?.conclusion ?? null,
    patientFio: appt.patient?.fullName ?? "Неизвестно",
    patientDob,
    doctorFio: slot?.doctor?.fullName ?? "Не указан",
  };
}
