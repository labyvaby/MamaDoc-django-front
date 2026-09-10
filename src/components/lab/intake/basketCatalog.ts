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
  const found = tests.filter((test) => {
    if (selectedIds.has(test.id)) return false;
    if (!isTestVisibleForGender(test.lisGender, patientGender)) return false;
    if (q && !test.title.toLowerCase().includes(q)) return false;
    return true;
  });
  if (!q) return found;
  return found
    .map((test, index) => ({ test, index, rank: matchRank(test.title, q) }))
    .sort((left, right) =>
      left.rank === right.rank
        ? left.index - right.index
        : left.rank - right.rank,
    )
    .map((row) => row.test);
}

/**
 * Насколько удачно название совпало с запросом: 0 — начало названия, 1 —
 * начало слова внутри названия, 2 — середина слова.
 *
 * Поиск по подстроке находит и середину слова: «оак» совпадает с
 * «психоАКтивных», и такая строка, оказавшись первой, выглядит как поломанный
 * поиск — набравший «оак» ищет общий анализ крови, а не наркотические
 * вещества в волосах. Совпадения не отбрасываются (иногда середина слова —
 * единственное, что нашлось), а опускаются в конец выдачи.
 */
function matchRank(title: string, query: string): number {
  const haystack = title.toLowerCase();
  if (haystack.startsWith(query)) return 0;
  const wordStart = new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeForRegExp(query)}`,
    "u",
  );
  return wordStart.test(haystack) ? 1 : 2;
}

/** Экранирование запроса: в названиях ЛИС хватает скобок, плюсов и точек. */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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


/**
 * Количество после нажатия «плюс» или «минус».
 *
 * Ниже одного не опускается: строка с нулевым количеством — это ноль
 * пробирок и ноль денег, то есть мусор в заказе ЛИС, а убрать позицию
 * можно кнопкой удаления. Испорченное значение (поле ввода отдаёт `NaN` на
 * пустой строке) считается единицей, а не превращает сумму заказа в `NaN`.
 */
export function stepCount(current: number, delta: number): number {
  if (!Number.isFinite(current) || current < 1) return 1;
  return Math.max(1, Math.trunc(current + delta));
}

export interface CatalogGroup {
  /** Ключ группы — id ближайшей категории или `other`. */
  key: string;
  /** Путь категорий от корня: «Гематология › Общий анализ». */
  title: string;
  /** Группа из ветеринарного раздела каталога. */
  veterinary: boolean;
  tests: LabTest[];
}

const OTHER_GROUP = "Прочее";
const VETERINARY_ROOT = /ветеринар/i;

/**
 * Каталог, разложенный по категориям дерева ЛИС.
 *
 * Дерево приходит плоским списком с `parentId`, и категория в нём — такая
 * же строка, как анализ. В плоской выдаче «Аллергологические исследования»
 * выглядели анализом за ноль сомов, и их можно было положить в корзину.
 * Здесь позицией считается только лист (узел без детей), а узлы с детьми
 * дают заголовки групп; путь склеивается от корня, чтобы вложенные
 * категории были различимы.
 *
 * Поиск ищет и по названию позиции, и по пути категорий: набравший «аллерг»
 * ждёт весь раздел, а в названиях самих анализов этого слова нет. Внутри
 * группы порядок — как в `filterAvailableTests`: сначала совпадения в начале
 * названия.
 *
 * Ветеринария помечается флагом по корню дерева: в каталоге ЛИС она вся
 * живёт под одним «ВЕТЕРИНАРНЫЕ ИССЛЕДОВАНИЯ», и в детской клинике её место
 * не в общей выдаче.
 */
export function groupCatalog(
  tests: LabTest[],
  patientGender: string,
  query: string,
): CatalogGroup[] {
  const byId = new Map(tests.map((test) => [test.id, test]));
  const hasChildren = new Set<number>();
  for (const test of tests) {
    if (test.parentId != null) hasChildren.add(test.parentId);
  }
  const q = query.trim().toLowerCase();

  const ancestorsOf = (test: LabTest): LabTest[] => {
    const chain: LabTest[] = [];
    let cursor = test.parentId != null ? byId.get(test.parentId) : undefined;
    while (cursor) {
      chain.unshift(cursor);
      cursor = cursor.parentId != null ? byId.get(cursor.parentId) : undefined;
    }
    return chain;
  };

  const groups = new Map<string, CatalogGroup>();
  const rows: { key: string; test: LabTest; rank: number; index: number }[] = [];

  tests.forEach((test, index) => {
    if (hasChildren.has(test.id)) return;
    if (!isTestVisibleForGender(test.lisGender, patientGender)) return;
    const ancestors = ancestorsOf(test);
    const path = ancestors.map((node) => node.title.trim()).join(" › ");
    const inTitle = !q || test.title.toLowerCase().includes(q);
    const inPath = !!q && path.toLowerCase().includes(q);
    if (!inTitle && !inPath) return;

    const key = ancestors.length ? String(ancestors[ancestors.length - 1].id) : "other";
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        title: path || OTHER_GROUP,
        veterinary: ancestors.length > 0 && VETERINARY_ROOT.test(ancestors[0].title),
        tests: [],
      });
    }
    rows.push({
      key,
      test,
      rank: inTitle && q ? matchRank(test.title, q) : 0,
      index,
    });
  });

  rows.sort((left, right) =>
    left.rank === right.rank ? left.index - right.index : left.rank - right.rank,
  );
  for (const row of rows) groups.get(row.key)!.tests.push(row.test);
  return [...groups.values()];
}
