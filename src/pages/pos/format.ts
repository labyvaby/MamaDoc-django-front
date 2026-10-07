/**
 * Формат сумм кассы: «28 000» — разряды неразрывными пробелами, без символа
 * валюты (знак сома рисует `PosAmount`, он подчёркнут).
 *
 * Не `formatKGS` из `utility/format`: тот даёт «28 000 KGS», а в макете и на
 * чеке стоит знак «с» — как и на витрине (`src/pages/public-booking`).
 */
/**
 * Минус перед суммой списания — только когда списано хоть что-то: «−0 с»
 * в итогах читается как ошибка. Ноль сравниваем после округления до тыйына.
 */
export const showMinus = (value: number, negative?: boolean): boolean =>
  Boolean(negative) && Number.isFinite(value) && Math.round(Math.abs(value) * 100) > 0;

/** Сумма для экрана и чека — правила в комментарии в начале файла. */
export const formatPosAmount = (value: number): string =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value).replace(/\s/g, " ");
