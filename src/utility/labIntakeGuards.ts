/**
 * Почему кнопка приёма анализов заблокирована.
 *
 * Возвращает текст причины, а не булев флаг: молчаливо серая кнопка
 * заставляет регистратора гадать, чего не хватает, и в очереди это дороже
 * всего. Порядок проверок — от общего к частному, чтобы первой называлась
 * самая ранняя незакрытая причина.
 *
 * Настройки раздела (`settingsLoading` / `settingsFailed` /
 * `sectionConfigured`) проверяются первыми, раньше пациента и корзины: это
 * единственные причины здесь, которые регистратор не может закрыть сам —
 * ни выбором пациента, ни заполнением карты. Пока значение `chargeTubes` не
 * подтверждено ответом `GET /lab/settings/`, использовать его для расчёта
 * суммы нельзя (см. `chargeTubes` в `LabIntakeDrawer` и docstring
 * `LabSettings` в `api/lab.ts`) — именно так организация с включённой
 * платой за пробирки раньше получала непроходящий приём.
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
  /**
   * Настройки раздела (`GET /lab/settings/`) ещё не пришли — первый запрос
   * в процессе. Пока флаг `chargeTubes` не подтверждён ответом, сумма может
   * молча разойтись с бэкендом, поэтому кнопку держим недоступной, а не
   * подставляем `false` "на всякий случай".
   */
  settingsLoading: boolean;
  /**
   * Запрос настроек раздела окончательно не удался (после исчерпанных
   * повторов). Отдельно от `settingsLoading` — причина другая, и текст
   * должен звать обновить страницу, а не продолжать врать «загружаем».
   */
  settingsFailed: boolean;
  /**
   * Заведена ли у организации конфигурация раздела лаборатории вообще
   * (`OrganizationLabConfig`, поле `configured` в ответе `GET
   * /lab/settings/`). `false` означает, что приём анализов провалится на
   * бэкенде при любых данных формы — это состояние организации, а не то,
   * что регистратор может исправить в дровере. Значение имеет смысл только
   * когда `settingsLoading` и `settingsFailed` оба `false`.
   */
  sectionConfigured: boolean;
  /**
   * Названия анализов корзины, которые лаборатория делает только по
   * направлению (`LabTest.requiresDoctor`, признак `@required_doctor`
   * каталога ЛИС). Не число и не флаг: без имён регистратор не поймёт,
   * какую строку убрать, если направления нет и врача не назвать.
   */
  referralRequiredFor: string[];
  /** Выбранный направивший врач; `null` — не выбран. */
  referringDoctorId: number | null;
  /**
   * Пациент дал согласие на обработку персональных данных. Заказ уезжает в
   * стороннюю лабораторию с ФИО, ИНН и датой рождения — без согласия
   * передавать их нельзя, и бэкенд это тоже проверяет.
   */
  personalDataConsent: boolean;
}

export function intakeBlockReason(state: IntakeState): string | null {
  if (state.settingsLoading) return "Загружаем настройки раздела…";
  if (state.settingsFailed) {
    return "Не удалось загрузить настройки раздела — обновите страницу";
  }
  if (!state.sectionConfigured) {
    return "Раздел лаборатории не настроен — обратитесь к администратору";
  }
  if (state.patientId === null) return "Выберите пациента";
  if (!state.patientInn.trim()) return "Заполните ИНН пациента";
  if (!state.patientBirthDate) return "Заполните дату рождения пациента";
  if (state.patientGender !== "male" && state.patientGender !== "female") {
    return "Укажите пол пациента";
  }
  if (!state.personalDataConsent) {
    return "Отметьте согласие пациента на обработку персональных данных";
  }
  if (state.lineCount < 1) return "Добавьте хотя бы один анализ";

  if (state.referralRequiredFor.length > 0 && state.referringDoctorId === null) {
    return (
      'Укажите направившего врача — его требуют: ' +
      state.referralRequiredFor.join(", ")
    );
  }

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
