import dayjs from "dayjs";

import { ApiError, getErrorCode } from "../../api/client";
import { tt } from "../../i18n/t";
import {
  AMOUNT_LOCKED,
  DEAL_MOVED,
  REOPEN_FORBIDDEN,
  type Deal,
  type DealActivityType,
} from "../../api/deals";

/** Доска общая: чужие переносы должны проявляться без ручного F5. */
export const DEALS_REFRESH_MS = 60_000;

/** Сколько карточек тянем в колонку: доска — оперативный вид, не архив. */
export const DEALS_COLUMN_SIZE = 50;

/** Названия типов касания — ленивые геттеры, иначе значение застынет до инициализации i18n. */
export const DEAL_ACTIVITY_META: Record<DealActivityType, { readonly label: string }> = {
  call: {
    get label() {
      return tt("deals:activity.call");
    },
  },
  message: {
    get label() {
      return tt("deals:activity.message");
    },
  },
  visit: {
    get label() {
      return tt("deals:activity.visit");
    },
  },
  note: {
    get label() {
      return tt("deals:activity.note");
    },
  },
};

/**
 * Сколько карточка сидит в этапе. Бэк отдаёт дробные дни (0.04 — час), поэтому
 * до суток показываем часы: «0 дн.» у карточки, просрочившей норматив на
 * четыре часа, читается как «только что приехала».
 */
export function stageAgeLabel(daysInStage: number | null): string | null {
  if (daysInStage == null) return null;
  if (daysInStage < 1 / 24) return "меньше часа";
  if (daysInStage < 1) {
    const hours = Math.floor(daysInStage * 24);
    return `${hours} ч`;
  }
  const days = Math.floor(daysInStage);
  return `${days} дн.`;
}

/** Дата касания в компактном виде: сегодня — время, иначе день и месяц. */
export function nextActionLabel(nextActionAt: string | null): string | null {
  if (!nextActionAt) return null;
  const d = dayjs(nextActionAt);
  if (!d.isValid()) return null;
  if (d.isSame(dayjs(), "day")) return d.format("HH:mm");
  if (d.isSame(dayjs().add(1, "day"), "day")) return `завтра, ${d.format("HH:mm")}`;
  return d.format("D MMM");
}

/** Точная дата для тултипов и лент. */
export function exactMoment(value: string | null): string {
  if (!value) return "—";
  const d = dayjs(value);
  return d.isValid() ? d.format("DD.MM.YYYY HH:mm") : "—";
}

/** Длительность этапа из лога переходов: бэк даёт дробные часы. */
export function stageDurationLabel(durationHours: number | null): string | null {
  if (durationHours == null) return null;
  if (durationHours < 1) return "меньше часа";
  if (durationHours < 24) return `${Math.floor(durationHours)} ч`;
  return `${Math.floor(durationHours / 24)} дн.`;
}

/** Сделка закрыта — заморожена сумма, к ней не применяется норматив этапа. */
export const isDealClosed = (deal: Deal) => deal.stageKind !== "open";

/**
 * Текст ошибки для тоста.
 *
 * Запреты по деньгам и причине потери своего кода не имеют: бэк отдаёт
 * VALIDATION_ERROR с готовым русским текстом, его и показываем. Свои
 * формулировки — только там, где текст сервера ничего не объясняет
 * пользователю (конфликт переноса, нехватка права).
 */
export function dealsErrorMessage(error: unknown, fallback: string): string {
  const code = getErrorCode(error);
  if (code === DEAL_MOVED) return tt("deals:conflict.moved");
  if (code === REOPEN_FORBIDDEN) return tt("deals:conflict.reopenForbidden");
  if (code === AMOUNT_LOCKED) return tt("deals:detail.amountLocked");
  if (error instanceof ApiError && error.message) return error.message;
  return error instanceof Error && error.message ? error.message : fallback;
}
