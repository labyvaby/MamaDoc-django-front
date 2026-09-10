import type {
  AvailabilityDay,
  AvailabilitySlot,
  EmployeeAvailability,
} from "../../api/scheduling";

/**
 * Свой шаг сетки окон у сотрудника.
 *
 * Бэкенд режет день на окна фиксированно (30 минут, либо длительность услуги,
 * если в запрос availability передали `serviceId`). Регистратуре этого мало:
 * терапевт принимает по 20 минут, УЗИ — по 40, и сетка «через 30» либо
 * заставляет считать в уме, либо теряет время между приёмами.
 *
 * Шаг живёт в карточке сотрудника (`employee.slotDurationMinutes`, бэк-тикет
 * `MamaDoc/backend_ticket_employee_slot_duration.md`). Пока бэк отдаёт сетку по
 * 30 минут, окна пересобираются здесь — из свободных интервалов дня. Когда бэк
 * начнёт применять шаг сам, пересборка станет пустой операцией: нарезка уже
 * нарезанного тем же шагом даёт те же окна (см. тест «идемпотентность»).
 */

/** Общий шаг сетки, если у сотрудника свой не задан (значение бэка). */
export const DEFAULT_SLOT_MINUTES = 30;

/** Варианты шага в карточке сотрудника. */
export const SLOT_DURATION_OPTIONS = [10, 15, 20, 30, 40, 45, 60, 90] as const;

/** 'HH:MM' → минуты от полуночи. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/** Минуты от полуночи → 'HH:MM' с ведущими нулями (формат бэка). */
function toHhMm(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Слот сетки, в который можно записать пациента. */
function isGridFree(slot: AvailabilitySlot): boolean {
  return slot.free && slot.appointmentId == null && !slot.busyElsewhere;
}

interface Range {
  start: number;
  end: number;
  /** Слот-донор метаданных (филиал смены) — первый в диапазоне. */
  source: AvailabilitySlot;
}

/** Свободные слоты дня → непрерывные интервалы (обед и приёмы их разрывают). */
function freeRanges(slots: AvailabilitySlot[]): Range[] {
  const sorted = slots
    .filter(isGridFree)
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start));
  const ranges: Range[] = [];
  for (const slot of sorted) {
    const start = toMinutes(slot.start);
    const end = toMinutes(slot.end);
    const last = ranges[ranges.length - 1];
    // Смежные и перекрывающиеся сливаем; разрыв (обед, приём) начинает новый.
    if (last && start <= last.end) {
      last.end = Math.max(last.end, end);
    } else {
      ranges.push({ start, end, source: slot });
    }
  }
  return ranges;
}

/**
 * Пересобрать свободные окна дня под шаг `stepMinutes`.
 *
 * Занятые окна, прошедшие и `busyElsewhere` остаются как пришли: их время
 * принадлежит приёму или уже прошло, нарезать там нечего. Хвост интервала
 * короче шага окном не становится — записать в него приём этой длины всё равно
 * нельзя (свободные 30 минут при шаге 40 окна не дают).
 */
export function resampleDay(
  day: AvailabilityDay,
  stepMinutes?: number | null,
): AvailabilityDay {
  if (!stepMinutes || stepMinutes <= 0) return day;
  const free = day.slots.filter(isGridFree);
  if (!free.length) return day;
  // Сетка уже нужного шага (бэк применил его сам) — не пересобираем, чтобы не
  // менять ссылки и не гонять мемоизацию вида впустую.
  const alreadyStepped = free.every(
    (slot) => toMinutes(slot.end) - toMinutes(slot.start) === stepMinutes,
  );
  if (alreadyStepped) return day;

  const kept = day.slots.filter((slot) => !isGridFree(slot));
  const rebuilt: AvailabilitySlot[] = [];
  for (const range of freeRanges(day.slots)) {
    for (let from = range.start; from + stepMinutes <= range.end; from += stepMinutes) {
      rebuilt.push({
        ...range.source,
        start: toHhMm(from),
        end: toHhMm(from + stepMinutes),
      });
    }
  }
  const slots = [...kept, ...rebuilt].sort((a, b) => a.start.localeCompare(b.start));
  // freeCount — счётчик окон на плитке даты: считаем его по той же сетке, что
  // видна в дне, иначе лента обещает «5 окон», а в дне их восемь.
  return { ...day, slots, freeCount: rebuilt.length };
}

/**
 * Тот же шаг ко всем дням сотрудника.
 *
 * `nearestFree` не пересчитываем: начало свободного интервала — всегда первое
 * окно любой нарезки, поэтому ближайшее время не сдвигается. Исключение —
 * интервал короче шага: бэк считает его свободным, а окна в нём нет (о нём же
 * §«Открытые вопросы» тикета — считать такой интервал свободным или нет,
 * решает бэк, когда начнёт применять шаг сам).
 */
export function resampleEmployeeDays(
  employee: EmployeeAvailability,
  stepMinutes?: number | null,
): EmployeeAvailability {
  if (!stepMinutes || stepMinutes <= 0) return employee;
  let changed = false;
  const days = employee.days.map((day) => {
    const next = resampleDay(day, stepMinutes);
    if (next !== day) changed = true;
    return next;
  });
  return changed ? { ...employee, days } : employee;
}
