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
 * Собрать ответы для отправки в приёме.
 *
 * Отдаёт запись на каждый вопрос из `questions`, даже если ответа ещё нет
 * (пустая строка вместо `undefined`) — `intakeBlockReason` не пускает к
 * отправке, пока это не так, но сама сборка не должна зависеть от порядка
 * вызовов и обязана быть тотальной функцией от своих аргументов.
 *
 * **Известный контрактный разрыв (обнаружен 2026-09-09).** Бэкенд ожидает в
 * `LabOrderAnswerInput.lisQuestionId` идентификатор вопроса **в самой ЛИС**
 * (`LabTestQuestion.lis_question_id` — `server/apps/lab/services.py` ищет
 * ответы через `lis_question_id__in=...`, а не по Django `pk`). Но
 * `GET /api/lab/tests/questions/` (`question_to_payload` в
 * `server/apps/lab/api/serializers.py`) кладёт в поле `id` **локальный
 * Django pk** (`question.pk`), а не `lis_question_id` — в отличие от
 * `LabTest`/`LabProfile`/`LabInstrument`, где `id` (локальный) и `lisId`
 * (ЛИС) существуют как два разных явных поля, у `LabQuestion` второго
 * идентификатора нет вовсе. Ниже подставляется единственное, что есть —
 * `question.id`, — и это разойдётся с `lis_question_id`, как только каталог
 * перестанет быть игрушечным (сейчас он пуст, ЛИС недоступна со стенда).
 * Требует правки бэкенда (добавить настоящий `lisId` в
 * `LabTestQuestionPayload`), а не фронта — собирать здесь больше не из чего.
 */
export function assembleLabAnswers(
  questions: LabQuestion[],
  answers: Record<number, string>,
): LabOrderAnswerInput[] {
  return questions.map((question) => ({
    lisQuestionId: question.lisQuestionId,
    title: question.title,
    fieldType: question.fieldType,
    value: answers[question.id] ?? "",
  }));
}
