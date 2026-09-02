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
 * (400), и форма до этого не доводит (`findOdoctorSettingsProblem`). Здесь это
 * страховка на случай состояния, собранного в обход формы: введённый пароль
 * важнее галочки, потому что его набрали руками сейчас.
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
  if (form.newPassword !== "") payload.newPassword = form.newPassword;
  else if (form.clearPassword) payload.clearPassword = true;
  return payload;
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
  return parts.length > 0 ? parts.join(" ") : raw;
}
