/**
 * Метка «есть фото / нет фото» в списке расходов — сигнал бухгалтерии, что чек
 * к расходу не приложили.
 */
import type { Expense } from "../../api/expenses";

export type ExpensePhotoMark = "has" | "missing";

type PhotoMarkSource = Pick<
  Expense,
  "categoryKind" | "categoryPhotoRequired" | "photoUrl" | "photosCount"
>;

/**
 * Какую метку показать у расхода; `null` — метки нет.
 *
 * Метки нет у авансов и ЗП (чека не бывает по смыслу вида) и у категорий, где
 * в админке снят флаг «Требуется фото чека» (инкассация). Фото считаем по
 * `photosCount` — старый чек плюс «фото накладной»; пока бэк без этого поля,
 * смотрим на старый `photoUrl`.
 */
export function expensePhotoMark(exp: PhotoMarkSource): ExpensePhotoMark | null {
  if (exp.categoryKind !== "general") return null;
  if (exp.categoryPhotoRequired === false) return null;
  const count = exp.photosCount ?? (exp.photoUrl ? 1 : 0);
  return count > 0 ? "has" : "missing";
}
