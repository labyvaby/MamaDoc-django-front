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
 * Метку показываем только по категориям с флагом «Требуется фото чека»
 * (тумблер на странице категорий): у инкассации, аванса и ЗП он обычно снят.
 * Пока бэк без флага — как раньше: обычным расходам метка есть, авансу/ЗП нет.
 * Фото считаем по `photosCount` — старый чек плюс «фото накладной»; без этого
 * поля смотрим на старый `photoUrl`.
 */
export function expensePhotoMark(exp: PhotoMarkSource): ExpensePhotoMark | null {
  const required = exp.categoryPhotoRequired ?? exp.categoryKind === "general";
  if (!required) return null;
  const count = exp.photosCount ?? (exp.photoUrl ? 1 : 0);
  return count > 0 ? "has" : "missing";
}
