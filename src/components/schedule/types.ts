import type { ClinicalRole } from "../../api/staff";

/**
 * Общие типы для страницы графика смен (/schedule).
 * Используются и календарём (ScheduleCalendar), и формой (ShiftForm),
 * чтобы избежать рассинхрона двух параллельных объявлений.
 */

export type ScheduleEmployee = {
  id: number;
  full_name: string;
  photo?: string;
  clinicalRole?: ClinicalRole;            // doctor | nurse | other (фильтр по роли)
  specialization?: string;                // строка для отображения в форме
  specializations?: { id: number; name: string }[]; // для фильтра по специализации
};

export type ScheduleShift = {
  id: number;
  employes_id: number; // ID сотрудника
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  start_time?: string; // HH:mm
  end_time?: string;   // HH:mm
  is_night_shift?: boolean;
  lunch_start?: string; // HH:mm
  lunch_end?: string;   // HH:mm
  weekdays?: string[];
  employee?: ScheduleEmployee | null;
};
