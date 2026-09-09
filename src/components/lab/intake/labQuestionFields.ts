/**
 * Чистая логика QuestionsSection: какой контрол рисовать по `fieldType` и
 * как собрать ответы для приёма.
 *
 * Вынесено из компонента по тому же принципу, что и `basketCatalog.ts`: в
 * проекте нет рендер-тестов, логика тестируется отдельно от JSX.
 */

import type { LabOrderAnswerInput, LabQuestion } from "../../../api/lab";

/** Управляющий элемент, которым рисуется вопрос анализа. */
export type LabQuestionFieldKind = "date" | "boolean" | "integer" | "text";

const FIELD_KIND_BY_TYPE: Record<string, LabQuestionFieldKind> = {
  DATE: "date",
  BOOLEAN: "boolean",
  INTEGER: "integer",
};

/**
 * Тип поля ввода по `fieldType` вопроса.
 *
 * `fieldType` — закрытое перечисление ЛИС (`STRING`, `INTEGER`, `DATE`,
 * `BOOLEAN`, `SELECT`, `FULL_NAME`, `FULL_NAME2`, `PIN`, `PHONE`, `ADDRESS`,
 * `PASSWORD_DATA`), но управляющих элементов у нас четыре: план явно
 * выделяет дату, переключатель и число, всё остальное — обычный текст. Сюда
 * же попадает `SELECT` — контракт ЛИС не передаёт варианты выбора, поэтому
 * до подтверждения у ExpressLab он тоже рисуется текстовым полем (с
 * подсказкой из `defaultValue` — см. `QuestionsSection`), и любой ещё не
 * описанный тип: расширение перечисления вендором в будущем не должно
 * прятать вопрос, которому просто не нашлось спец-поля.
 */
export function labQuestionFieldKind(fieldType: string): LabQuestionFieldKind {
  return FIELD_KIND_BY_TYPE[fieldType] ?? "text";
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
    lisQuestionId: question.id,
    title: question.title,
    fieldType: question.fieldType,
    value: answers[question.id] ?? "",
  }));
}
