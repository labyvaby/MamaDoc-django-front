/**
 * Денежные форматтеры кассы. Отдельный модуль, а не часть карточки: иначе
 * файл с компонентами экспортирует ещё и функции, и Vite теряет fast refresh.
 *
 * Валюта здесь своя, «с» вместо formatKGS: касса — плотный числовой блок,
 * где длинный суффикс ломает выравнивание колонок сумм.
 */

/** Символ валюты — рисуется отдельным приглушённым span'ом там, где важна колонка. */
export const SOM = "с";

/**
 * Число без валюты. Копейки показываем только когда они есть: в сомах их почти
 * не бывает, а «,00» у каждой строки удлиняет число на три знака и превращает
 * колонку сумм в кашу.
 */
export function formatAmount(value: number): string {
  const hasKopecks = Math.abs(Math.round(value * 100) % 100) > 0;
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: hasKopecks ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

export function formatSom(value: number): string {
  return `${formatAmount(value)} ${SOM}`;
}

/** Сумма со знаком направления: +1 — приход, −1 — расход. */
export function signedSom(value: number, direction: 1 | -1): string {
  return (direction > 0 ? "+ " : "− ") + formatSom(value);
}
