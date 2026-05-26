import dayjs from "dayjs";
import "dayjs/plugin/timezone";
import "dayjs/plugin/utc";

export type AppointmentServiceJson = {
  id?: string;
  service_id?: string;
  name?: string;
  service_name?: string;
  price?: number;
  cost?: number;
  image_url?: string | null;
  doctor_id?: string | null;
  doctor_name?: string | null;
  doctor_photo?: string | null;
  performer_id?: string | null;
  performer_name?: string | null;
  performer_photo?: string | null;
  status?: string;
  quantity?: number;
};

export type Appointment = {
  id: string;
  appointment_at: string; // ISO string
  appointment_day: string; // YYYY-MM-DD
  appointment_time: string; // HH:mm
  duration?: number | null; // minutes
  formatted_date: string; // DD.MM.YYYY HH:MI
  doctor_name: string;
  doctor_id?: string;
  doctor_photo_url?: string | null;
  patient_name: string;
  patient_id?: string;
  service_names: string;
  services_json?: AppointmentServiceJson[] | string | null;
  parsed_services?: AppointmentServiceJson[] | null;
  status: "Оплачено" | "Ожидаем" | "Со скидкой" | string;
  is_night: boolean;
  total_cost: number;
  total_amount: number;
  paid_cash: number;
  paid_card: number;
  paid_balance: number;
  paid_bonuses: number;
  discount: number;
  debt: number;
  admin_comment?: string | null;
  complaints?: string | null;
  doctor_complaints?: string | null;
  diagnosis_code?: string | null; // Код диагноза по МКБ-10
  conclusion?: string | null; // Заключение врача
  clinic_diagnosis_id?: string | null; // ID выбранного клинического диагноза
  diagnosis_title?: string | null; // Название диагноза (из ClinicDiagnoses)
  /**
   * Дополнительное поле из агрегирующего представления, используемое
   * как запасной вариант для расчёта общей суммы.
   */
  estimated_total?: number | null;
  weight?: number | null;
  height?: number | null;
  temperature?: number | null;
  anamnesis?: string | null;
  objective?: string | null;
  diagnosis_data?: any[] | null;
  conclusion_history?: any[] | null;
  performer_ids?: string[] | null;
  has_conclusion?: boolean;
  has_bank_confirmation?: boolean;
  created_at?: string;
  updated_at?: string;
  created_by_name?: string | null;
  updated_by_name?: string | null;
};

// Строка из агрегирующего представления AppointmentsAggregated
export type AggregatedAppointmentRow = {
  id?: string;
  appointment_at?: string;
  duration?: number | null;
  formatted_date?: string;
  doctor_name?: string;
  doctor_id?: string | null;
  doctor_photo_url?: string | null;
  patient_name?: string;
  patient_id?: string | null;
  service_names?: string;
  services_json?: AppointmentServiceJson[] | string | null;
  status?: string;
  is_night?: boolean | null;
  total_cost?: number | null;
  total_amount?: number | null;
  paid_cash?: number | null;
  paid_card?: number | null;
  paid_balance?: number | null;
  paid_bonuses?: number | null;
  discount?: number | null;
  debt?: number | null;
  admin_comment?: string | null;
  complaints?: string | null;
  doctor_complaints?: string | null;
  diagnosis_code?: string | null;
  conclusion?: string | null;
  clinic_diagnosis_id?: string | null;
  diagnosis_title?: string | null;
  estimated_total?: number | null;
  performer_ids?: string[] | null;
  has_conclusion?: boolean;
  has_bank_confirmation?: boolean;
  weight?: number | null;
  height?: number | null;
  temperature?: number | null;
  anamnesis?: string | null;
  objective?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by_name?: string | null;
  updated_by_name?: string | null;
};

export const mapAggregatedRowToAppointment = (
  row: AggregatedAppointmentRow,
): Appointment => {
  const totalCost = row.total_cost ?? 0;
  const totalAmount = row.total_amount ?? row.total_cost ?? 0;

  let parsedServices: AppointmentServiceJson[] | null = null;
  try {
    if (row.services_json) {
      if (typeof row.services_json === "string") {
        parsedServices = JSON.parse(row.services_json);
      } else if (Array.isArray(row.services_json)) {
        parsedServices = row.services_json;
      }
    }
  } catch (e) {
    console.error("Error parsing services_json in mapAggregatedRowToAppointment:", e);
  }

  const dateObj = row.appointment_at ? dayjs(row.appointment_at).tz("Asia/Bishkek") : null;

  return {
    id: String(row.id ?? ""),
    appointment_at: row.appointment_at ?? "",
    appointment_day: dateObj ? dateObj.format("YYYY-MM-DD") : "",
    appointment_time: dateObj ? dateObj.format("HH:mm") : "",
    duration: row.duration,
    // Форматируем дату на клиенте, чтобы она отображалась в локальном часовом поясе.
    // Если appointment_at отсутствует, используем пришедшее с сервера formatted_date как запасной вариант.
    formatted_date: dateObj
        ? dateObj.format("HH:mm DD.MM.YYYY")
        : (row.formatted_date ?? ""),
    doctor_name: row.doctor_name ?? "",
    doctor_id: row.doctor_id ?? undefined,
    doctor_photo_url: row.doctor_photo_url ?? null,
    patient_name: row.patient_name ?? "",
    patient_id: row.patient_id ?? undefined,
    service_names: row.service_names ?? "",
    services_json: row.services_json,
    parsed_services: parsedServices,
    status: row.status ?? "Ожидаем",
    is_night: Boolean(row.is_night),
    total_cost: Number.isFinite(Number(totalCost)) ? Number(totalCost) : 0,
    total_amount: Number.isFinite(Number(totalAmount))
      ? Number(totalAmount)
      : 0,
    paid_cash: Number.isFinite(Number(row.paid_cash))
      ? Number(row.paid_cash)
      : 0,
    paid_card: Number.isFinite(Number(row.paid_card))
      ? Number(row.paid_card)
      : 0,
    paid_balance: Number.isFinite(Number(row.paid_balance))
      ? Number(row.paid_balance)
      : 0,
    paid_bonuses: Number.isFinite(Number(row.paid_bonuses))
      ? Number(row.paid_bonuses)
      : 0,
    discount: Number.isFinite(Number(row.discount)) ? Number(row.discount) : 0,
    debt: Number.isFinite(Number(row.debt)) ? Number(row.debt) : 0,
    admin_comment: row.admin_comment ?? null,
    complaints: row.complaints ?? null,
    doctor_complaints: row.doctor_complaints ?? null,
    diagnosis_code: row.diagnosis_code ?? null,
    conclusion: row.conclusion ?? null,
    clinic_diagnosis_id: row.clinic_diagnosis_id ?? null,
    diagnosis_title: row.diagnosis_title ?? null,
    estimated_total: row.estimated_total ?? null,
    performer_ids: row.performer_ids ?? [],
    has_conclusion: Boolean(row.has_conclusion),
    has_bank_confirmation: Boolean(row.has_bank_confirmation),
    weight: row.weight ?? null,
    height: row.height ?? null,
    temperature: row.temperature ?? null,
    anamnesis: row.anamnesis ?? null,
    objective: row.objective ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by_name: row.created_by_name,
    updated_by_name: row.updated_by_name,
  };
};

// Option in patient autocomplete on Home page
export type PatientOption = {
  id: string;
  label: string;
  fio?: string;
  phone?: string;
  is_blacklisted?: boolean | null;
  blacklist_reason?: string | null;
  "ФИО пациента"?: string;
  Телефон?: string;
};

// Row in "услуга + врач" таблице при создании приёма
export type ServiceRowEntry = {
  quantity: number;
  serviceId: string;
  doctorId: string;
};

// Словарь флагов по статусам приёмов
export type StatusMap = Record<string, boolean>;

/**
 * Веса для сортировки статусов приёмов.
 * Чем меньше число, тем выше статус в списке.
 */
const STATUS_PRIORITY: Record<string, number> = {
  "Ожидаем": 1,
  "Пациент здесь": 2,
  "Со скидкой": 3,
  "Оплачено": 4,
  "Отменено": 100,
  "Пациент не пришел": 101,
};

/**
 * Сравнивает два приёма для сортировки.
 * Приоритет: Статус (по весам), затем время приёма.
 */
export const compareAppointmentsByStatus = (a: Appointment, b: Appointment): number => {
  const priorityA = STATUS_PRIORITY[a.status] ?? 50; // 50 для неизвестных статусов
  const priorityB = STATUS_PRIORITY[b.status] ?? 50;

  if (priorityA !== priorityB) {
    return priorityA - priorityB;
  }

  // Если статусы одинаковые, сортируем по времени (по возрастанию)
  return dayjs(a.appointment_at).unix() - dayjs(b.appointment_at).unix();
};
