/**
 * Чистая логика QuestionsSection: какой контрол рисовать по `fieldType` и
 * как собрать ответы для приёма.
 *
 * Вынесено из компонента по тому же принципу, что и `basketCatalog.ts`: в
 * проекте нет рендер-тестов, логика тестируется отдельно от JSX.
 */

import type { LabOrderAnswerInput, LabQuestion } from "../../../api/lab";

/** Управляющий элемент, которым рисуется вопрос анализа. */
export type LabQuestionFieldKind = "date" | "choice" | "integer" | "text";

const FIELD_KIND_BY_TYPE: Record<string, LabQuestionFieldKind> = {
  DATE: "date",
  BOOLEAN: "choice",
  INTEGER: "integer",
};

/**
 * Строковое представление ответа BOOLEAN не подтверждено ExpressLab (как и
 * код пола в `basketCatalog.ts`) — используем `"true"`/`"false"`. Контракт
 * уточнится, менять придётся только здесь.
 */
export const BOOLEAN_OPTIONS: readonly LabQuestionOption[] = [
  { value: "true", label: "Да" },
  { value: "false", label: "Нет" },
];

/** Разделитель вариантов в `defaultValue` вопроса типа SELECT. */
const SELECT_OPTION_SEPARATOR = "|";

/**
 * Вариантов не больше этого — рисуются кнопками в ряд (Да / Нет /
 * Неизвестно), иначе — выпадающий список с поиском: у «Гражданства» в ЛИС
 * двести пятьдесят стран, у «Кода исследования» — девять строк по полсотни
 * знаков, кнопками такое не разложить.
 */
export const INLINE_CHOICE_MAX = 4;

export interface LabQuestionOption {
  /** Что уедет в ЛИС как `value` ответа. */
  value: string;
  label: string;
}

/**
 * Варианты ответа на вопрос.
 *
 * Для `SELECT` ЛИС кладёт перечень в `default_value` через «|»:
 * «Да|Нет|Неизвестно», «Женский|Мужской», «1-роды|2-роды|…». Это не
 * значение по умолчанию — это и есть список; в ЛИС такой вопрос
 * заполняется выбором, и свободный текст туда не подходит. Хвостовой
 * разделитель («…|Япония|») даёт пустой элемент — он выбрасывается.
 * `BOOLEAN` — те же две кнопки, но со строковыми `true`/`false`.
 * У остальных типов вариантов нет.
 */
export function labQuestionOptions(question: Pick<LabQuestion, "fieldType" | "defaultValue">): LabQuestionOption[] {
  if (question.fieldType === "BOOLEAN") return [...BOOLEAN_OPTIONS];
  if (question.fieldType !== "SELECT") return [];
  return question.defaultValue
    .split(SELECT_OPTION_SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => ({ value: item, label: item }));
}

/**
 * Тип поля ввода по вопросу.
 *
 * `fieldType` — закрытое перечисление ЛИС (`STRING`, `INTEGER`, `DATE`,
 * `BOOLEAN`, `SELECT`, `FULL_NAME`, `FULL_NAME2`, `PIN`, `PHONE`, `ADDRESS`,
 * `PASSWORD_DATA`), но управляющих элементов у нас четыре: дата, выбор из
 * вариантов, число, всё остальное — обычный текст. `SELECT` — выбор, когда
 * в `defaultValue` есть из чего выбирать (`labQuestionOptions`); пустой
 * перечень — текст, чтобы вопрос не стал неотвечаемым. Любой ещё не
 * описанный тип — тоже текст: расширение перечисления вендором в будущем
 * не должно прятать вопрос, которому просто не нашлось спец-поля.
 */
export function labQuestionFieldKind(
  question: Pick<LabQuestion, "fieldType" | "defaultValue">,
): LabQuestionFieldKind {
  if (question.fieldType === "SELECT") {
    return labQuestionOptions(question).length > 0 ? "choice" : "text";
  }
  return FIELD_KIND_BY_TYPE[question.fieldType] ?? "text";
}

/**
 * Один вопрос ЛИС, к каким бы анализам корзины он ни относился.
 *
 * `GET /api/lab/tests/questions/` отдаёт строку на каждую пару
 * «анализ → вопрос», а один вопрос («Беременность», «Контроль после
 * лечения») законно принадлежит нескольким анализам — у зеркала
 * уникальность `(lab_test, lis_question_id)`. Ответ же у заказа один на
 * вопрос (`LabOrderAnswer` уникален по `(order, lis_question_id)`), и
 * спрашивать одно и то же дважды, а потом уехать в бэкенд с двумя
 * ответами — ошибка целостности вместо заказа. Поэтому форма ключует
 * ответы `lisQuestionId`, а не локальным `id` строки зеркала.
 */
export interface LabQuestionGroup {
  /** Идентификатор вопроса в ЛИС — ключ ответа в форме. */
  lisQuestionId: number;
  /** Первая строка зеркала с этим вопросом: текст, тип, варианты. */
  question: LabQuestion;
  /** Анализы корзины, которым нужен ответ, в порядке появления. */
  testIds: number[];
}

/** Свернуть строки зеркала в уникальные вопросы, порядок — первого появления. */
export function groupLabQuestions(questions: readonly LabQuestion[]): LabQuestionGroup[] {
  const byLisId = new Map<number, LabQuestionGroup>();
  for (const question of questions) {
    const group = byLisId.get(question.lisQuestionId);
    if (group) {
      if (!group.testIds.includes(question.testId)) group.testIds.push(question.testId);
    } else {
      byLisId.set(question.lisQuestionId, {
        lisQuestionId: question.lisQuestionId,
        question,
        testIds: [question.testId],
      });
    }
  }
  return [...byLisId.values()];
}

/**
 * Собрать ответы для отправки в приёме.
 *
 * Отдаёт запись на каждый уникальный вопрос из `questions`
 * (`groupLabQuestions`), даже если ответа ещё нет (пустая строка вместо
 * `undefined`) — `intakeBlockReason` не пускает к отправке, пока это не
 * так, но сама сборка не должна зависеть от порядка вызовов и обязана быть
 * тотальной функцией от своих аргументов. Ответы ключуются `lisQuestionId`.
 */
export function assembleLabAnswers(
  questions: readonly LabQuestion[],
  answers: Record<number, string>,
): LabOrderAnswerInput[] {
  return groupLabQuestions(questions).map(({ question, lisQuestionId }) => ({
    lisQuestionId,
    title: question.title,
    fieldType: question.fieldType,
    value: answers[lisQuestionId] ?? "",
  }));
}
