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
 *
 * Требование выбрать способ безнала при оплате картой бэкенд приёма
 * анализов не предъявляет (`ensure_cashless_method_valid` пропускает
 * `None`) — это решение продуктовое, по прецеденту остальных денежных форм
 * проекта (`warehouse.services._resolve_sale_cashless_method`,
 * `DjangoAddExpenseDrawer`): без способа платёж картой не отследить в кассе.
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
  cashlessMethodId: number | null;
  /**
   * Есть из чего выбрать способ безнала: справочник загружен и в нём есть
   * хотя бы один активный способ — совпадает по смыслу с
   * `useCashlessMethods().isRequired`. Без этого флага блокировка требовала
   * бы способ даже там, где организации нечего предложить, — тупик, которого
   * избегают и `warehouse.services._resolve_sale_cashless_method`
   * (`has_active_methods`), и денежные формы фронта (`DjangoAddExpenseDrawer`
   * и подобные).
   */
  cashlessMethodRequired: boolean;
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

  // Оплата картой без способа безнала технически пройдёт (бэкенд —
  // ensure_cashless_method_valid — при cashlessMethodId=None ничего не
  // проверяет), но это дыра в кассовом учёте. Требование добавлено по
  // прецеденту проекта, не бэкенда приёма анализов, — см. docstring поля
  // `cashlessMethodRequired`.
  if (state.paidCard > 0 && state.cashlessMethodRequired && state.cashlessMethodId === null) {
    return "Выберите способ безналичной оплаты";
  }
  return null;
}
