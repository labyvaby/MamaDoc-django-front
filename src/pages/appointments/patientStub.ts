import type { AppointmentPatientShort } from "../../api/appointments";
import type { DjangoPatient } from "../../api/patients";

/**
 * Построить минимальный DjangoPatient из короткой формы пациента приёма
 * (id/fullName/phone/photoUrl) — для предзаполнения дроверов, которым нужен
 * DjangoPatient (например, RecordVaccinationDrawer). Остальные поля
 * заполняются нейтральными значениями; при необходимости дровер догрузит
 * пациента сам.
 */
export function appointmentPatientToStub(
  patient: AppointmentPatientShort,
  organizationId: number,
): DjangoPatient {
  return {
    id: patient.id,
    organizationId,
    branch: null,
    family: null,
    fullName: patient.fullName,
    phone: patient.phone,
    secondaryPhone: null,
    birthDate: null,
    gender: "unknown",
    address: null,
    notes: null,
    source: null,
    photoUrl: patient.photoUrl,
    inn: "",
    isBlacklisted: false,
    blacklistReason: "",
    isActive: true,
    createdAt: "",
    updatedAt: "",
  };
}
