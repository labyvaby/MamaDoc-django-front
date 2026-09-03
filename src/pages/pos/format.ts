/**
 * Формат сумм кассы: «28 000» — разряды неразрывными пробелами, без символа
 * валюты (знак сома рисует `PosAmount`, он подчёркнут).
 *
 * Не `formatKGS` из `utility/format`: тот даёт «28 000 KGS», а в макете и на
 * чеке стоит знак «с» — как и на витрине (`src/pages/public-booking`).
 */
export const formatPosAmount = (value: number): string =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value).replace(/\s/g, " ");
