import { apiRequest } from "./client";
import { parseBackendError } from "./appointments";

/**
 * Настройки интеграции с публичной витриной записи odoctor.kg: CRM выкладывает
 * туда свободные окна врачей и закрывает их, как только окно занято записью.
 *
 * Скоуп — организация: строка настроек одна на организацию (OneToOne), поэтому
 * ни списка, ни id ресурса здесь нет — только GET и PATCH одного объекта.
 * `organizationId` нужен суперпользователю и мультиорг-аккаунту, как и на
 * прочих org-скоупленных эндпоинтах.
 *
 * За этими полями лежит учётная запись кабинета odoctor — ключ от чужой
 * системы, а не данные пациентов, — поэтому право отдельное: `odoctor.manage`,
 * а не права на расписание и приёмы.
 *
 * ⚠ Пароль наружу не отдаётся никогда — ни открытым текстом, ни шифротекстом.
 * В ответе есть только `hasPassword`, и это не осторожность бэкенда, а контракт
 * (`server/apps/odoctor/api/payloads.py`): поле формы заполнять из ответа
 * нечем, а «пустое поле» поэтому обязано значить «не менять» — см.
 * `buildOdoctorSettingsPatch`.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Ответ GET/PATCH. Поля времени обновления в контракте нет: `updated_at` на
 * модели есть, но в payload его не выносили (проверено по
 * `server/apps/odoctor/api/payloads.py` — там ровно эти пять полей).
 */
export interface OdoctorSettings {
  organizationId: number;
  /** Выключено — синхронизация организацию не трогает. */
  isEnabled: boolean;
  /** На сколько дней вперёд держать окна на витрине. */
  horizonDays: number;
  /** Логин сервисной учётной записи кабинета odoctor. */
  odoctorLogin: string;
  /** Задан ли пароль. Само значение наружу не отдаётся никогда. */
  hasPassword: boolean;
}

/**
 * Тело PATCH. Опущенные поля бэк не трогает.
 *
 * Ключей про пароль два, и второй — не симметрия ради симметрии. Пустой
 * `newPassword` означает «не менять», поэтому стирание живёт на отдельном
 * `clearPassword`: иначе правка горизонта (форма пароль не знает и не
 * присылает) каждый раз стирала бы учётку и молча выключала интеграцию.
 * Прислать оба сразу нельзя — бэк отвечает 400, а не выбирает за оператора.
 */
export interface OdoctorSettingsUpdatePayload {
  organizationId?: number | null;
  isEnabled?: boolean;
  horizonDays?: number;
  odoctorLogin?: string;
  newPassword?: string;
  clearPassword?: boolean;
}

// ── API functions ──────────────────────────────────────────────────────────────

export function getOdoctorSettings(
  signal?: AbortSignal,
  options?: { organizationId?: number | null },
): Promise<OdoctorSettings> {
  const query = new URLSearchParams();
  if (options?.organizationId != null) {
    query.set("organizationId", String(options.organizationId));
  }
  const qs = query.toString();
  return apiRequest<OdoctorSettings>(`/odoctor/settings/${qs ? `?${qs}` : ""}`, {
    signal,
  });
}

/**
 * Ответ собирается бэком из сохранённой строки, а не из присланного тела, —
 * поэтому его можно (и нужно) считать новым состоянием формы.
 */
export function updateOdoctorSettings(
  payload: OdoctorSettingsUpdatePayload,
): Promise<OdoctorSettings> {
  return apiRequest<OdoctorSettings>("/odoctor/settings/", {
    method: "PATCH",
    body: payload,
  });
}

// ── Поля формы ─────────────────────────────────────────────────────────────────

/**
 * Предел, который поле ввода обещает атрибутом `max`. Бэк принимает больше
 * (`PositiveSmallIntegerField`, до 32767), но обещание надо либо держать, либо
 * не давать: HTML-атрибут при наборе не действует, и без клампа набранные 3650
 * уехали бы на бэк молча.
 */
export const ODOCTOR_HORIZON_MAX_DAYS = 365;

/**
 * Строка из поля «Горизонт, дней» → число дней.
 *
 * `Number`, а не `parseInt`: `type="number"` пропускает экспоненциальную
 * запись, и `parseInt("1e3")` вернул бы `1` — оператор набрал тысячу, а
 * сохранился бы один день. Дробь округляем вниз: msgspec ждёт `int` и на
 * `7.9` ответил бы 400, а половина дня горизонта не значит ничего.
 *
 * Всё, что не разобралось, и всё меньше единицы — ноль. Ноль здесь осмысленное
 * состояние, а не ошибка: пустое поле выглядит именно так, бэк отвергает его
 * только при включённой интеграции, и об этом есть что сказать словами
 * (`horizonRequired`).
 */
export function parseHorizonDays(raw: string): number {
  const value = Math.floor(Number(raw));
  if (!Number.isFinite(value) || value < 1) return 0;
  return Math.min(value, ODOCTOR_HORIZON_MAX_DAYS);
}

// ── Форма → тело PATCH ─────────────────────────────────────────────────────────

/** Состояние формы настроек — то, из чего собирается тело PATCH. */
export interface OdoctorSettingsForm {
  isEnabled: boolean;
  horizonDays: number;
  odoctorLogin: string;
  /**
   * Введённый пароль. Пустая строка — «оставить прежний», а не «стереть»:
   * заполнить это поле из ответа сервера нечем, и правка соседних полей не
   * должна задевать учётку.
   */
  newPassword: string;
  /** Явный отзыв пароля — отдельная галочка, не пустое поле ввода. */
  clearPassword: boolean;
}

/**
 * Ответ сервера → начальное состояние формы. Единственное место, где форма
 * заполняется с сервера, — и потому единственное место, где держится правило
 * «поле пароля не заполняется из ответа никогда».
 *
 * `newPassword` здесь всегда `""`, и это не «пока нечем заполнить»: значения
 * пароля в ответе нет и не будет (payload его не отдаёт), а пустое поле уже
 * значит «оставить прежний». Подставить сюда что-либо — даже плейсхолдер из
 * звёздочек — значит отправить это в `newPassword` следующим сохранением.
 *
 * `clearPassword` тоже сбрасывается: отзыв учётки — разовое действие, и после
 * сохранения галочка не должна оставаться взведённой.
 */
export function odoctorSettingsToForm(settings: OdoctorSettings): OdoctorSettingsForm {
  return {
    isEnabled: settings.isEnabled,
    horizonDays: settings.horizonDays,
    odoctorLogin: settings.odoctorLogin,
    newPassword: "",
    clearPassword: false,
  };
}

/**
 * Форма после щелчка по галочке отзыва.
 *
 * Взведённая галочка **всегда** чистит поле пароля, и это единственное, что
 * делает истинным «противоречие отправить нельзя вовсе»: без очистки состояние
 * «новый пароль вместе со стиранием» собиралось бы одним щелчком, а бэк
 * отвечает на него 400. Обе страховки ниже — `findOdoctorSettingsProblem` и
 * `buildOdoctorSettingsPatch` — стоят на этой очистке, а не заменяют её.
 *
 * Снятие галочки поле не восстанавливает: восстанавливать нечего, значение
 * стёрто, а не спрятано.
 */
export function applyClearPasswordToggle(
  form: OdoctorSettingsForm,
  checked: boolean,
): OdoctorSettingsForm {
  return checked
    ? { ...form, clearPassword: true, newPassword: "" }
    : { ...form, clearPassword: false };
}

/**
 * Что стоит под полем пароля. Состояния путать нельзя: пустое поле у заданного
 * пароля значит «оставить прежний», пустое поле у незаданного — «пароля нет», и
 * по одному виду поля они неотличимы.
 *
 * `clearPassword` проверяется первым — тем же выбором последней надежды, что и
 * в `buildOdoctorSettingsPatch`: подпись обязана говорить о том, что уедет на
 * бэк, а уедет отзыв.
 */
export type OdoctorPasswordFieldState = "clearing" | "changing" | "set" | "unset";

export function passwordFieldState(
  form: OdoctorSettingsForm,
  hasPassword: boolean,
): OdoctorPasswordFieldState {
  if (form.clearPassword) return "clearing";
  if (form.newPassword !== "") return "changing";
  return hasPassword ? "set" : "unset";
}

/**
 * Тело PATCH из состояния формы.
 *
 * `newPassword` уходит только когда в поле что-то ввели: пустое поле значит «не
 * менять», и отправлять пустую строку нельзя — на бэке `set_password('')`
 * стирает пароль, то есть правка горизонта выключала бы интеграцию.
 *
 * `clearPassword` уходит только когда галочка стоит. Бэк проверяет ключ на
 * истинность, а не на присутствие, так что `false` был бы безвреден, — но
 * ключа, которого нет, точно нельзя задеть.
 *
 * Оба ключа одновременно функция не отдаёт никогда: их сочетание бэк отвергает
 * (400), и форма до этого не доводит — галочка чистит поле
 * (`applyClearPasswordToggle`), а `findOdoctorSettingsProblem` блокирует
 * сохранение. Состояние недостижимо, так что здесь остаётся только выбор
 * последней надежды, и он в пользу отзыва: не поставить новый пароль — потеря
 * удобства, не стереть утёкший — потеря контроля над доступом к чужой системе.
 *
 * Значение пароля не подрезаем: пробел внутри секрета — часть секрета. Логин
 * подрезаем — бэк сравнивает его через `.strip()`, и пробел по краям только
 * прятал бы «пустой логин» от глаз оператора.
 */
export function buildOdoctorSettingsPatch(
  form: OdoctorSettingsForm,
  organizationId?: number | null,
): OdoctorSettingsUpdatePayload {
  const payload: OdoctorSettingsUpdatePayload = {
    isEnabled: form.isEnabled,
    horizonDays: form.horizonDays,
    odoctorLogin: form.odoctorLogin.trim(),
  };
  if (organizationId != null) payload.organizationId = organizationId;
  if (form.clearPassword) payload.clearPassword = true;
  else if (form.newPassword !== "") payload.newPassword = form.newPassword;
  return payload;
}

/**
 * Сохранить форму: собрать тело, отправить PATCH и вернуть новое состояние —
 * и строку настроек, и форму под неё.
 *
 * Форма пересобирается из ответа **здесь**, а не эффектом на данных запроса, и
 * это не удобство. `queryClient.setQueryData` прогоняет ответ через
 * `replaceEqualDeep`, а тот при полном совпадении возвращает **прежнюю
 * ссылку** (`@tanstack/query-core@5.90.10`; `structuralSharing` включён по
 * умолчанию, Refine его не выключает). Смена одного пароля даёт побайтово тот
 * же payload — значения пароля в нём нет, а `hasPassword` был `true` и
 * остался, — ссылка не меняется, эффект на `[settings]` не срабатывает, и
 * набранный секрет остаётся в поле.
 *
 * Чем это плохо, по возрастанию: снекбар говорит «сохранено» при заполненном
 * поле, и естественная реакция — нажать «Сохранить» ещё раз; `newPassword`
 * уезжает при каждом следующем сохранении, включая правку одного горизонта,
 * то есть рушится ровно тот инвариант, ради которого
 * `buildOdoctorSettingsPatch` этот ключ и не кладёт; у двух операторов чужая
 * смена пароля молча откатывается на ту, что осталась в поле у первого; и
 * набранный секрет живёт в состоянии React неограниченно после успешного
 * сохранения.
 *
 * Лечить это добавлением `dataUpdatedAt` в зависимости эффекта нельзя: тогда
 * форма сбрасывалась бы на каждом перезапросе, затирая незаконченную правку.
 */
export async function saveOdoctorSettingsForm(
  form: OdoctorSettingsForm,
  organizationId?: number | null,
): Promise<{ settings: OdoctorSettings; form: OdoctorSettingsForm }> {
  const settings = await updateOdoctorSettings(
    buildOdoctorSettingsPatch(form, organizationId),
  );
  return { settings, form: odoctorSettingsToForm(settings) };
}

// ── Что бэк отвергнет ──────────────────────────────────────────────────────────

/**
 * Причина, по которой сохранять нет смысла: бэк ответит отказом. Каждая —
 * отдельная подпись в интерфейсе, потому что каждой соответствует своё
 * действие оператора, а не общее «что-то не так».
 *
 * `passwordConflict` — новый пароль вместе со стиранием (400 на
 * `NON_FIELD_ERRORS`).
 * `clearWhileEnabled` — стирание пароля при включённой интеграции. Правильный
 * порядок — сначала выключить интеграцию, потом отзывать учётку.
 * `loginRequired` / `passwordRequired` / `horizonRequired` — «включено, но не
 * работает»: без учётки прогон молча ничего не делает, а горизонт ноль дней —
 * тот же холостой ход, только тише.
 */
export type OdoctorSettingsProblem =
  | "passwordConflict"
  | "clearWhileEnabled"
  | "loginRequired"
  | "passwordRequired"
  | "horizonRequired";

/**
 * Первая причина отказа или `null`, если тело можно отправлять.
 *
 * Правила повторяют бэк (`services.save_odoctor_settings` плюс
 * `OrganizationOdoctorConfig.clean`), но названы точнее: бэк складывает пустой
 * логин и пустой пароль в одну ошибку, а оператору надо знать, какое из двух
 * полей заполнить. Проверка здесь не отменяет серверную — она избавляет от
 * похода за отказом, причину которого всё равно пришлось бы объяснять словами.
 *
 * `hasPassword` — из последнего ответа сервера: пароль уже задан, и пустое поле
 * ввода его сохраняет. Порядок проверок важен: стирание при включённой
 * интеграции оставляет строку и без пароля тоже, но подсказка нужна именно про
 * порядок действий, а не про «заполните пароль».
 */
export function findOdoctorSettingsProblem(
  form: OdoctorSettingsForm,
  hasPassword: boolean,
): OdoctorSettingsProblem | null {
  if (form.newPassword !== "" && form.clearPassword) return "passwordConflict";
  if (form.clearPassword && form.isEnabled) return "clearWhileEnabled";
  if (!form.isEnabled) return null;
  if (form.odoctorLogin.trim() === "") return "loginRequired";
  const willHavePassword = form.newPassword !== "" || (hasPassword && !form.clearPassword);
  if (!willHavePassword) return "passwordRequired";
  if (!form.horizonDays) return "horizonRequired";
  return null;
}

// ── Ошибка бэка ────────────────────────────────────────────────────────────────

/**
 * Ключи, под которыми бэк ключует причины отказа. `__all__` — Django
 * `NON_FIELD_ERRORS`: правило про сочетание двух ключей запроса, а не про поле
 * строки. Остальные — поля самой строки настроек.
 *
 * Список закрытый намеренно: срезать любой `слово:` в начале значило бы
 * отгрызать начало у сообщения, которое просто начинается с двоеточия
 * («Выберите одно: либо новый пароль…»).
 */
const ERROR_KEYS = ["__all__", "is_enabled", "horizon_days", "odoctor_login"] as const;

const ERROR_KEY_PREFIX = new RegExp(`^(?:${ERROR_KEYS.join("|")})\\s*:\\s*`);

/**
 * Текст отказа для показа человеку.
 *
 * Бэк форматирует `ValidationError` как `'<ключ>: <текст>'`, склеивая причины
 * через `'; '` (`views._validation_error_message`). Ключ — техническое имя, и
 * `__all__` в особенности: показать оператору клиники «__all__: Выберите
 * одно…» нельзя, а сам текст уже сформулирован по-человечески и в подписи к
 * полю не нуждается. Поэтому префикс снимаем, а текст показываем как ошибку
 * формы целиком.
 */
export function odoctorSettingsErrorMessage(err: unknown): string {
  const raw = parseBackendError(err);
  const parts = raw
    .split(";")
    .map((part) => part.trim().replace(ERROR_KEY_PREFIX, ""))
    .filter(Boolean);
  // Пустой результат означает, что от сообщения остались одни префиксы —
  // сырой текст всё же лучше пустой красной плашки.
  return parts.length > 0 ? parts.join("; ") : raw;
}


// ── Связи врачей ──────────────────────────────────────────────────────────────

/**
 * Связь одного врача CRM с врачом в кабинете odoctor.
 *
 * `branchIsEnabled` повторён в каждой строке нарочно: синхронизации нужны все
 * три выключателя — организация, филиал, врач. Строка с поднятым своим
 * тумблером при выключенном филиале не выложит ничего, и оператор, который
 * этого не видит, будет ждать окон, которые не появятся.
 *
 * `nameDrift` — запаркованное состояние: кабинет переименовал врача, и пока
 * человек не подтвердит новое имя в админке, синхронизация связь пропускает.
 * Правится только в админке: за снимком ФИО стоит решение «чьи окна куда
 * уходят», и в этом кабинете уже встречались «Канаатова» против «Канаатовна».
 */
export interface OdoctorLink {
  id: number;
  employeeId: number;
  employeeName: string;
  branchId: number;
  branchName: string;
  branchIsEnabled: boolean;
  odoctorBranchId: number;
  odoctorDoctorId: number;
  odoctorDoctorName: string;
  seanceLengthSeconds: number;
  isEnabled: boolean;
  nameDrift: boolean;
}

export interface OdoctorLinksResponse {
  organizationId: number;
  /**
   * Есть ли у клиники кабинет odoctor вообще — то есть заведена ли учётка.
   *
   * Карточка врача по этому признаку решает, рисовать ли блок синхронизации.
   * Блок показывается **каждому** врачу, а не только сопоставленным: иначе
   * оператор не отличит «этого врача не выкладываем» от «такой настройки
   * здесь нет». Но клинике без кабинета блок — шум.
   *
   * Считается по учётке, а не по выключателю интеграции: выключенная
   * интеграция с заведённой учёткой — нормальное состояние подготовки, в нём
   * врачей как раз и сопоставляют.
   */
  integrationConfigured: boolean;
  items: OdoctorLink[];
}

/** Один день предпросмотра: сколько окон в кабинете сейчас и станет. */
export interface OdoctorPreviewDay {
  date: string;
  inCabinet: number;
  wouldOffer: number;
}

/**
 * Что даст включение врача. Спрашивается до того, как тумблер щёлкнут.
 *
 * `wouldClearDays` — единственное число здесь, которое предупреждает, а не
 * успокаивает: день, в который CRM говорит «не работает», зеркало в кабинете
 * очищает. У врача, чьи окна кто-то ведёт руками, включение их снимет.
 */
export interface OdoctorPreview {
  linkId: number;
  odoctorDoctorName: string;
  days: OdoctorPreviewDay[];
  wouldClearDays: number;
}

export function getOdoctorLinks(
  signal?: AbortSignal,
  options?: { organizationId?: number | null; employeeId?: number | null },
): Promise<OdoctorLinksResponse> {
  const query = new URLSearchParams();
  if (options?.organizationId != null) {
    query.set("organizationId", String(options.organizationId));
  }
  // Карточка сотрудника спрашивает одного врача. Область видимости от этого
  // не меняется: её задаёт организация, и бэк сужает в том же запросе.
  if (options?.employeeId != null) {
    query.set("employeeId", String(options.employeeId));
  }
  const qs = query.toString();
  return apiRequest<OdoctorLinksResponse>(
    `/odoctor/links/${qs ? `?${qs}` : ""}`,
    { signal },
  );
}

export function getOdoctorLinkPreview(
  linkId: number,
  signal?: AbortSignal,
): Promise<OdoctorPreview> {
  return apiRequest<OdoctorPreview>(`/odoctor/links/${linkId}/preview/`, {
    signal,
  });
}

/** Переключить синхронизацию у одного врача. Больше ничего PATCH не примет. */
export function updateOdoctorLink(
  linkId: number,
  isEnabled: boolean,
): Promise<OdoctorLink> {
  return apiRequest<OdoctorLink>(`/odoctor/links/${linkId}/`, {
    method: "PATCH",
    body: { isEnabled },
  });
}

/** Филиал клиники в разрезе кабинета odoctor. */
export interface OdoctorBranch {
  branchId: number;
  branchName: string;
  /** Пусто — филиал с кабинетом не связан, врачей выкладывать некуда. */
  odoctorBranchId: number | null;
  /** Выключатель самой связи филиала: связан, но выключен — тоже случай. */
  isEnabled: boolean;
  /** Сопоставленных врачей, а не включённых: «сколько здесь разобрано». */
  mappedDoctors: number;
}

export interface OdoctorBranchesResponse {
  organizationId: number;
  items: OdoctorBranch[];
}

/**
 * Филиал самого кабинета — вариант выбора при связывании филиала.
 *
 * Адрес здесь не украшение: номер человеку не говорит ничего, а у клиники в
 * кабинете «Мама Доктор» на Орозбекова и «Мама Доктор Плюс» на Сейтек.
 * Ошибка отправит окна целого филиала в календарь другого.
 */
export interface OdoctorCabinetBranch {
  odoctorBranchId: number;
  name: string;
  address: string;
  /** Филиал CRM, который этот вариант уже занял. */
  linkedBranchId: number | null;
}

export interface OdoctorCabinetBranchesResponse {
  organizationId: number;
  items: OdoctorCabinetBranch[];
}

/** Филиалы кабинета. Ходит в кабинет — может ответить 502. */
export function getOdoctorCabinetBranches(
  signal?: AbortSignal,
  options?: { organizationId?: number | null },
): Promise<OdoctorCabinetBranchesResponse> {
  const query = new URLSearchParams();
  if (options?.organizationId != null) {
    query.set("organizationId", String(options.organizationId));
  }
  const qs = query.toString();
  return apiRequest<OdoctorCabinetBranchesResponse>(
    `/odoctor/cabinet-branches/${qs ? `?${qs}` : ""}`,
    { signal },
  );
}

/**
 * Связать филиал клиники с филиалом кабинета. Связь создаётся выключенной.
 *
 * Номер сверяет сервер со списком самого кабинета: присланный устаревшим
 * экраном он может оказаться вторым филиалом этой же клиники.
 */
export function linkOdoctorBranch(
  branchId: number,
  odoctorBranchId: number,
): Promise<OdoctorBranch> {
  return apiRequest<OdoctorBranch>(`/odoctor/branches/${branchId}/link/`, {
    method: "POST",
    body: { odoctorBranchId },
  });
}

/** Выключатель филиала. Тумблеры врачей он не трогает. */
export function setOdoctorBranchEnabled(
  branchId: number,
  isEnabled: boolean,
): Promise<OdoctorBranch> {
  return apiRequest<OdoctorBranch>(`/odoctor/branches/${branchId}/link/`, {
    method: "PATCH",
    body: { isEnabled },
  });
}

/**
 * Снять связь филиала. Сервер откажет, пока на филиале висят врачи: номер
 * врача без номера филиала — не адрес, и выложенные окна стали бы
 * недостижимыми.
 */
export function unlinkOdoctorBranch(
  branchId: number,
): Promise<OdoctorBranch> {
  return apiRequest<OdoctorBranch>(`/odoctor/branches/${branchId}/link/`, {
    method: "DELETE",
  });
}

/**
 * Подпись варианта в выборе: «1350 — Мама Доктор, ул. Орозбекова, 112».
 *
 * Номер остаётся первым: он же стоит в админке и в логах, и оператору,
 * который сверяется с кабинетом, искать глазами именно его.
 */
export function odoctorCabinetBranchLabel(
  branch: OdoctorCabinetBranch,
): string {
  const tail = [branch.name, branch.address].filter(Boolean).join(", ");
  return tail ? `${branch.odoctorBranchId} — ${tail}` : String(
    branch.odoctorBranchId,
  );
}

/**
 * Можно ли выбрать этот вариант для филиала `branchId`.
 *
 * Занятый другим филиалом остаётся видимым, но недоступным: скрыть его
 * значило бы оставить оператора искать филиал, который «пропал», а
 * позволить выбрать — свести два расписания в один календарь.
 */
export function odoctorCabinetBranchTaken(
  branch: OdoctorCabinetBranch,
  branchId: number,
): boolean {
  return branch.linkedBranchId !== null
    && branch.linkedBranchId !== branchId;
}

/** Сотрудник CRM, чьё ФИО свернулось в то же, что у врача кабинета. */
export interface OdoctorCabinetCandidate {
  employeeId: number;
  fullName: string;
}

/** Врач филиала кабинета и то, что о нём знает CRM. */
export interface OdoctorCabinetDoctor {
  odoctorDoctorId: number;
  odoctorDoctorName: string;
  /** Признак кабинета: врача там могли снять с публикации. */
  isActive: boolean;
  /**
   * Есть ли эта строка в кабинете вообще.
   *
   * Пусто — врача там больше нет, а связь осталась. Такую строку список
   * обязан показать: он идёт со стороны кабинета, и связь, о которой кабинет
   * молчит, осталась бы без строки — а значит, и без кнопки «Отвязать».
   * ФИО в ней — наш снимок, другого нет.
   */
  inCabinet: boolean;
  linkId: number | null;
  linkedEmployeeId: number | null;
  linkedEmployeeName: string | null;
  /** Подсказки по совпадению ФИО. Несколько — значит однофамильцы. */
  candidates: OdoctorCabinetCandidate[];
}

export interface OdoctorCabinetResponse {
  branchId: number;
  branchName: string;
  odoctorBranchId: number;
  items: OdoctorCabinetDoctor[];
}

export function getOdoctorBranches(
  signal?: AbortSignal,
  options?: { organizationId?: number | null },
): Promise<OdoctorBranchesResponse> {
  const query = new URLSearchParams();
  if (options?.organizationId != null) {
    query.set("organizationId", String(options.organizationId));
  }
  const qs = query.toString();
  return apiRequest<OdoctorBranchesResponse>(
    `/odoctor/branches/${qs ? `?${qs}` : ""}`,
    { signal },
  );
}

/** Врачи филиала в кабинете. Ходит в кабинет — может ответить 502. */
export function getOdoctorCabinetDoctors(
  branchId: number,
  signal?: AbortSignal,
): Promise<OdoctorCabinetResponse> {
  return apiRequest<OdoctorCabinetResponse>(
    `/odoctor/branches/${branchId}/doctors/`,
    { signal },
  );
}

/**
 * Сопоставить сотрудника CRM с врачом кабинета.
 *
 * Снимок ФИО не передаётся: его берёт сервер из ответа кабинета. На этом
 * снимке стоит проверка переименования, и присланное устаревшим экраном имя
 * либо запарковало бы свежую связь, либо поручилось за имя, которого в
 * кабинете уже нет.
 */
export function createOdoctorLink(input: {
  branchId: number;
  employeeId: number;
  odoctorDoctorId: number;
}): Promise<OdoctorLink> {
  return apiRequest<OdoctorLink>("/odoctor/links/", {
    method: "POST",
    body: input,
  });
}

/**
 * Снять связь. Сервер сначала вычищает выложенные дни в кабинете.
 *
 * Отвечает числом вычищенных дней: оператору надо видеть, что окна не
 * остались висеть в витрине без хозяина.
 */
export function deleteOdoctorLink(
  linkId: number,
): Promise<{ linkId: number; daysCleared: number }> {
  return apiRequest<{ linkId: number; daysCleared: number }>(
    `/odoctor/links/${linkId}/`,
    { method: "DELETE" },
  );
}

/**
 * Что предложить в строке врача кабинета.
 *
 * Порядок не произволен. `linked` первым: сопоставленная строка предлагает
 * отвязать, а не связать заново. Дальше — ровно одна подсказка против
 * нескольких: однофамильцы это первая причина, по которой автоматического
 * сопоставления нет вовсе, и подставлять первого из двух нельзя. `manual`
 * остаётся случаю, когда ФИО в кабинете и в CRM разошлись — «Канаатова»
 * против «Канаатовны».
 */
export type OdoctorCabinetRowState =
  | "linked"
  | "suggested"
  | "ambiguous"
  | "manual";

export function odoctorCabinetRowState(
  row: OdoctorCabinetDoctor,
): OdoctorCabinetRowState {
  if (row.linkId !== null) {
    return "linked";
  }
  if (row.candidates.length === 1) {
    return "suggested";
  }
  return row.candidates.length > 1 ? "ambiguous" : "manual";
}

/** Филиалы, в которых вообще есть что сопоставлять. */
export function odoctorLinkedBranches(
  response: OdoctorBranchesResponse | undefined,
): OdoctorBranch[] {
  return (response?.items ?? []).filter(
    (branch) => branch.odoctorBranchId !== null,
  );
}

/**
 * Почему эта строка ничего не выкладывает, даже с поднятым тумблером.
 *
 * Порядок не произволен. `drift` идёт первым, потому что он единственный
 * требует решения человека о конкретном враче; выключенный филиал — общая
 * настройка, и починить её проще. Выключенная организация здесь не
 * проверяется: она видна тумблером выше на той же странице, и дублировать её
 * в каждой строке значило бы утопить в шуме то, что касается именно врача.
 */
/**
 * Состояние синхронизации **врача целиком**, а не отдельной связи.
 *
 * В карточке врача переключатель один. Связей у него может быть несколько —
 * по одной на филиал, — но оператор включает не связь, а врача: «выкладываем
 * его окна». Блок на каждый филиал повторял одно и то же описание дважды и
 * заставлял щёлкать два раза там, где решение одно.
 *
 * `checked` считается по «хоть одна включена», а не «все»: если из двух
 * филиалов работает один, окна в витрину **уходят**, и выключенный вид
 * переключателя это бы скрыл. Неполноту несёт `partial` — её видно подписью,
 * а не молчанием.
 */
export interface OdoctorEmployeeSync {
  checked: boolean;
  /** Включено не во всех филиалах — состояние, которое надо назвать. */
  partial: boolean;
  /** Филиалы, где связь есть, но выкладывать ей мешает. */
  blockers: { branchName: string; reason: "drift" | "branch-off" }[];
  branchNames: string[];
}

export function odoctorEmployeeSync(
  links: OdoctorLink[],
): OdoctorEmployeeSync {
  const enabled = links.filter((link) => link.isEnabled);
  const blockers: OdoctorEmployeeSync["blockers"] = [];
  for (const link of links) {
    const reason = odoctorLinkBlocker(link);
    if (reason !== null) {
      blockers.push({ branchName: link.branchName, reason });
    }
  }
  return {
    checked: enabled.length > 0,
    partial: enabled.length > 0 && enabled.length < links.length,
    blockers,
    branchNames: links.map((link) => link.branchName),
  };
}

/** Итог предпросмотра по столбцам: сколько окон сейчас и сколько станет. */
export function odoctorPreviewTotals(
  preview: OdoctorPreview | undefined,
): { inCabinet: number; wouldOffer: number } {
  return (preview?.days ?? []).reduce(
    (sum, day) => ({
      inCabinet: sum.inCabinet + day.inCabinet,
      wouldOffer: sum.wouldOffer + day.wouldOffer,
    }),
    { inCabinet: 0, wouldOffer: 0 },
  );
}

/**
 * Что карточка врача показывает в блоке витрины: форму, подпись или ничего.
 *
 * Блок виден **каждому** врачу клиники с кабинетом, а не только
 * сопоставленному: иначе оператор не отличит «этого врача не выкладываем» от
 * «такой настройки здесь нет».
 *
 * Порядок не произволен. `hidden` идёт первым: клинике без кабинета блок —
 * шум, и он побеждает даже если связи почему-то пришли. Учётку могли убрать,
 * оставив сопоставления, — но без неё в витрину всё равно ничего не уходит, и
 * тумблер «включено» обещал бы работу, которой нет. Где именно кабинет не
 * настроен, видно на странице настроек витрины.
 */
export type OdoctorEmployeeBlockState = "hidden" | "unmapped" | "links";

export function odoctorEmployeeBlockState(
  response: OdoctorLinksResponse,
): OdoctorEmployeeBlockState {
  if (!response.integrationConfigured) {
    return "hidden";
  }
  return response.items.length > 0 ? "links" : "unmapped";
}

export type OdoctorLinkBlocker = "drift" | "branch-off" | null;

export function odoctorLinkBlocker(link: OdoctorLink): OdoctorLinkBlocker {
  if (link.nameDrift) {
    return "drift";
  }
  if (!link.branchIsEnabled) {
    return "branch-off";
  }
  return null;
}

/**
 * Стоит ли предупредить перед включением — и о чём.
 *
 * `null` означает «включать безопасно»: в кабинете у врача нет ничего, что
 * зеркало снесло бы. Такой был первый включённый врач — на неделю вперёд в
 * витрине у неё было пусто, и включение только добавляло окна.
 */
/**
 * День предпросмотра человеку: «ср, 9 сент.» вместо «2026-09-09».
 *
 * Собираем и печатаем в UTC нарочно. С сервера приходит календарная дата без
 * времени; отдай её `new Date(iso)` — она станет полуночью UTC, и в западной
 * зоне браузера «9 сентября» напечатается восьмым числом. Часовой пояс здесь
 * не при чём вовсе: врач работает в тот день, который написан в строке.
 *
 * Нечитаемую строку возвращаем как есть: показать её сырой честнее, чем
 * подставить сегодняшнее число.
 */
export function formatOdoctorDay(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) {
    return iso;
  }
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function previewClearWarning(
  preview: OdoctorPreview,
): { days: number; dates: string[] } | null {
  const clearing = preview.days.filter(
    (day) => day.inCabinet > 0 && day.wouldOffer === 0,
  );
  if (clearing.length === 0) {
    return null;
  }
  return { days: clearing.length, dates: clearing.map((day) => day.date) };
}
