/**
 * Подпись периода начисления.
 *
 * `periodLabel` бэкенд заполняет не всегда (у части начислений он пустой), а
 * `periodKey` — машинный: `initial`, `deposit`, `2026-08`. Без разбора в
 * интерфейс утекает сырое «initial» вместо «Первое начисление», поэтому
 * ключ переводим сами, а готовую подпись — уважаем как есть.
 */

const SPECIAL_KEYS: Record<string, string> = {
  initial: "Первое начисление",
  deposit: "Депозит",
};

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

const MONTH_KEY = /^(\d{4})-(\d{2})$/;

export function chargePeriodLabel(charge: { periodLabel: string; periodKey: string }): string {
  if (charge.periodLabel) return charge.periodLabel;

  const key = charge.periodKey;
  if (SPECIAL_KEYS[key]) return SPECIAL_KEYS[key];

  const month = MONTH_KEY.exec(key);
  if (month) {
    const index = Number(month[2]) - 1;
    if (index >= 0 && index < 12) return `${MONTHS[index]} ${month[1]}`;
  }
  return key;
}
