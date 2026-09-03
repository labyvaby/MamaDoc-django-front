/**
 * Почему кнопка приёма анализов заблокирована.
 *
 * Возвращает текст причины, а не булев флаг: молчаливо серая кнопка
 * заставляет регистратора гадать, чего не хватает, и в очереди это дороже
 * всего. Порядок проверок — от общего к частному, чтобы первой называлась
 * самая ранняя незакрытая причина.
 *
 * Три требования к карте пациента (ИНН, дата рождения, пол) — не наша
 * придирка, а требование ЛИС: `patientDTO` не собирается без них, а
 * референсные интервалы зависят от возраста и пола.
 */

/** Допустимая погрешность при сравнении денег, копейка. */
const MONEY_EPSILON = 0.005;

export interface IntakeState {
  patientId: number | null;
  patientInn: string;
  patientBirthDate: string | null;
  patientGender: string;
  lineCount: number;
  requiredQuestionIds: number[];
  answers: Record<number, string>;
  total: number;
  paidCash: number;
  paidCard: number;
}

export function intakeBlockReason(state: IntakeState): string | null {
  if (state.patientId === null) return "Выберите пациента";
  if (!state.patientInn.trim()) return "Заполните ИНН пациента";
  if (!state.patientBirthDate) return "Заполните дату рождения пациента";
  if (state.patientGender !== "male" && state.patientGender !== "female") {
    return "Укажите пол пациента";
  }
  if (state.lineCount < 1) return "Добавьте хотя бы один анализ";

  const unanswered = state.requiredQuestionIds.some(
    (id) => !(state.answers[id] ?? "").trim(),
  );
  if (unanswered) return "Ответьте на все вопросы";

  const paid = state.paidCash + state.paidCard;
  if (Math.abs(paid - state.total) > MONEY_EPSILON) {
    return "Оплата не совпадает с суммой заказа";
  }
  return null;
}
