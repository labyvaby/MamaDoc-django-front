/**
 * Чистая логика BasketSection: кого показывать в поиске и как склеить
 * выбранные строки с каталогом.
 *
 * Вынесено из компонента, потому что в проекте нет `@testing-library` и
 * рендер-тестов не бывает — логика тестируется отдельно от JSX (см.
 * `labTotals.ts`, `labIntakeGuards.ts`).
 */

import type { LabTest } from "../../../api/lab";

export interface BasketLine {
  testId: number;
  count: number;
  express: boolean;
}

/**
 * Код пола ЛИС → кому анализ не подходит.
 *
 * Соответствие `'1'` — мужской, `'2'` — женский **не подтверждено
 * ExpressLab** (см. блокеры в `lab-intake-design.md`), поэтому оно собрано в
 * одной константе, а не размазано по условиям: когда вендор подтвердит или
 * опровергнет коды, менять придётся одно место.
 */
const LIS_GENDER_CODE = {
  male: "1",
  female: "2",
} as const;

/**
 * Виден ли анализ пациенту с данным полом.
 *
 * Неизвестный код `lisGender` (не `'1'`, не `'2'`, не пустая строка) и
 * неизвестный пол пациента (карта ещё не дозаполнена, `"unknown"`)
 * трактуются как «ограничения нет»: спрятать доступный анализ хуже, чем
 * показать лишний — регистратор всё равно видит название. Так же поступает
 * бэкенд в `lab/validators.py`.
 */
export function isTestVisibleForGender(lisGender: string, patientGender: string): boolean {
  if (lisGender === LIS_GENDER_CODE.male && patientGender === "female") return false;
  if (lisGender === LIS_GENDER_CODE.female && patientGender === "male") return false;
  return true;
}

/**
 * Каталог, доступный для добавления: подходит по полу пациента, совпадает с
 * поиском по названию и ещё не лежит в корзине.
 *
 * Уже выбранные тесты **исключаются**, а не помечаются: тогда добавить один
 * и тот же `testId` дважды физически нечем — за количеством уже выбранного
 * анализа отвечает отдельный контрол (`onCountChange`) в списке выбранного,
 * а не повторное нажатие «добавить» в поиске.
 */
export function filterAvailableTests(
  tests: LabTest[],
  selected: BasketLine[],
  patientGender: string,
  query: string,
): LabTest[] {
  const selectedIds = new Set(selected.map((line) => line.testId));
  const q = query.trim().toLowerCase();
  return tests.filter((test) => {
    if (selectedIds.has(test.id)) return false;
    if (!isTestVisibleForGender(test.lisGender, patientGender)) return false;
    if (q && !test.title.toLowerCase().includes(q)) return false;
    return true;
  });
}

export interface SelectedTestLine extends BasketLine {
  /** `null`, если testId не нашёлся в каталоге — см. ниже. */
  test: LabTest | null;
}

/**
 * Строки корзины с деталями из каталога (название, цена).
 *
 * `test: null`, если testId не нашёлся в переданном каталоге: каталог мог
 * ещё не загрузиться, либо строка восстановлена из черновика (`formDraft`)
 * для теста, которого сейчас нет в ответе API. Секция обязана остаться живой
 * карточкой в этом случае, а не упасть на `.title` у `undefined`.
 */
export function resolveSelectedLines(tests: LabTest[], selected: BasketLine[]): SelectedTestLine[] {
  const byId = new Map(tests.map((test) => [test.id, test]));
  return selected.map((line) => ({ ...line, test: byId.get(line.testId) ?? null }));
}
