import { ApiError, getErrorCode, getErrorTraceId } from "../../api/client";

/**
 * Ошибки кассы — на языке кассира, а не программиста.
 *
 * Каждая ошибка — это заголовок «что случилось» и подсказка «что делать».
 * Технические детали (HTTP-статус, текст исключения) кассиру не показываем;
 * для обращения в поддержку есть `traceId` — тот же id, по которому бэкенд
 * находит запрос в логах и Sentry.
 *
 * Каталог ниже — единственное место, где живут тексты: новые ситуации
 * добавляются сюда, а не строкой в `setError(...)` посреди страницы.
 */

export type PosErrorSeverity = "error" | "warning" | "info";

export type PosUserError = {
  code: PosErrorCode;
  /** Коротко: что случилось. */
  title: string;
  /** Что делать кассиру. */
  hint?: string;
  severity: PosErrorSeverity;
  /** Код обращения в поддержку — только для ошибок сервера. */
  traceId?: string | null;
};

type Params = Record<string, string | number | undefined>;
type Entry = {
  title: string | ((p: Params) => string);
  hint?: string | ((p: Params) => string);
  severity?: PosErrorSeverity;
};

const product = (p: Params) => (p.name ? `«${p.name}»` : "Этот товар");

export const POS_ERROR_CATALOG = {
  // ——— Сканер и поиск товара ———
  SCAN_NOT_FOUND: {
    title: "Товар не найден",
    hint: (p) =>
      `Штрихкод ${p.code ?? ""} не заведён в каталоге или товар не продаётся на этом складе. Проверьте этикетку или найдите товар по названию.`,
    severity: "warning",
  },
  SCAN_AMBIGUOUS: {
    title: "Один штрихкод у нескольких товаров",
    hint: (p) =>
      `Код ${p.code ?? ""} указан у нескольких товаров. Выберите нужный через поиск и сообщите товароведу, чтобы он исправил карточки.`,
    severity: "warning",
  },
  SCAN_BLOCKED_DIALOG: {
    title: "Товар не добавлен",
    hint: "Сначала закройте открытое окно (оплата, скидка, выбор варианта), затем отсканируйте товар ещё раз.",
    severity: "warning",
  },
  SCAN_HELD_RECEIPT: {
    title: "Открыт отложенный чек",
    hint: "В отложенный чек нельзя добавлять товары. Оплатите его или начните новый чек.",
    severity: "warning",
  },
  SCAN_BUSY: {
    title: "Касса сохраняет чек",
    hint: "Дождитесь окончания и отсканируйте товар ещё раз.",
    severity: "warning",
  },
  NO_SELL_PERMISSION: {
    title: "Нет права на продажу",
    hint: "Попросите администратора выдать вам доступ к продажам в кассе.",
  },
  NO_WAREHOUSE: {
    title: "В филиале нет склада",
    hint: "Добавьте склад в разделе «Склады» и оформите приход товара, затем вернитесь в кассу.",
  },

  // ——— Клиент ———
  CLIENT_PHOTO_NOT_SAVED: {
    title: "Клиент создан, но фото не сохранилось",
    hint: "Клиент уже выбран в чеке. Фото можно добавить позже в его карточке на странице «Клиенты».",
    severity: "warning",
  },

  // ——— Остатки и варианты ———
  OUT_OF_STOCK: {
    title: "Нет в наличии",
    hint: (p) => `${product(p)} закончился на этом складе. Проверьте остаток или выберите другой товар.`,
    severity: "warning",
  },
  STOCK_LIMIT: {
    title: "Больше нет на складе",
    hint: (p) =>
      `${product(p)}: на складе ${p.stock ?? "—"} шт., и все они уже в чеке.`,
    severity: "warning",
  },
  VARIANT_UNAVAILABLE: {
    title: "Вариант недоступен",
    hint: "Такого цвета или размера нет на складе в нужном количестве. Выберите другой вариант.",
    severity: "warning",
  },
  VARIANT_DUPLICATE: {
    title: "Этот вариант уже в чеке",
    hint: "Измените количество в его строке.",
    severity: "info",
  },

  // ——— Касса и бизнес-правила (ответы сервера) ———
  SHIFT_CLOSED: {
    title: "Кассовая смена не открыта",
    hint: "Откройте смену в разделе «Касса», затем повторите продажу.",
  },
  DISCOUNT_REJECTED: {
    title: "Скидка не применена",
    hint: (p) => String(p.message ?? "Проверьте размер скидки."),
    severity: "warning",
  },
  PROMO_REJECTED: {
    title: "Промокод не принят",
    hint: (p) => String(p.message ?? "Проверьте промокод."),
    severity: "warning",
  },
  CERTIFICATE_REJECTED: {
    title: "Сертификат не принят",
    hint: (p) => String(p.message ?? "Проверьте номер сертификата."),
    severity: "warning",
  },
  BONUS_REJECTED: {
    title: "Бонусы не списаны",
    hint: (p) => String(p.message ?? "Проверьте, выбран ли покупатель."),
    severity: "warning",
  },
  STOCK_REJECTED: {
    title: "Не хватает товара на складе",
    hint: (p) => String(p.message ?? "Уменьшите количество или уберите позицию."),
    severity: "warning",
  },
  RETURN_REJECTED: {
    title: "Возврат невозможен",
    hint: (p) => String(p.message ?? "Проверьте чек и количество к возврату."),
    severity: "warning",
  },
  VALIDATION: {
    title: "Проверьте данные",
    hint: (p) => String(p.message ?? "Некоторые значения заполнены неверно."),
    severity: "warning",
  },

  // ——— Связь, доступ, сервер ———
  NETWORK: {
    title: "Нет связи с сервером",
    hint: "Проверьте интернет. Корзина сохранена на этом устройстве — повторите действие, когда связь вернётся.",
  },
  SESSION_EXPIRED: {
    title: "Вы вышли из системы",
    hint: "Войдите снова — корзина сохранится на этом устройстве.",
  },
  FORBIDDEN: {
    title: "Недостаточно прав",
    hint: "Это действие вам не разрешено. Обратитесь к администратору организации.",
  },
  MODULE_DISABLED: {
    title: "Раздел не подключён",
    hint: "У организации не подключён нужный модуль. Обратитесь к администратору.",
  },
  NOT_FOUND: {
    title: "Запись не найдена",
    hint: "Возможно, её удалили или она относится к другому филиалу. Обновите страницу.",
    severity: "warning",
  },
  CONFLICT: {
    title: "Данные уже изменились",
    hint: "Похоже, этот чек изменили одновременно с вами. Обновите страницу и повторите.",
    severity: "warning",
  },
  RATE_LIMIT: {
    title: "Слишком много действий подряд",
    hint: "Подождите несколько секунд и повторите.",
    severity: "warning",
  },
  SERVER: {
    title: "Сбой на сервере",
    hint: "Попробуйте ещё раз. Если ошибка повторяется — сообщите администратору код ниже.",
  },
  UNKNOWN: {
    title: "Что-то пошло не так",
    hint: "Попробуйте ещё раз. Если ошибка повторяется — обновите страницу.",
  },
} satisfies Record<string, Entry>;

export type PosErrorCode = keyof typeof POS_ERROR_CATALOG;

const resolve = (value: Entry["title"] | Entry["hint"], params: Params) =>
  typeof value === "function" ? value(params) : value;

/** Ошибка из каталога: `posError("OUT_OF_STOCK", { name: "Шарф" })`. */
export function posError(code: PosErrorCode, params: Params = {}, traceId?: string | null): PosUserError {
  const entry: Entry = POS_ERROR_CATALOG[code];
  return {
    code,
    title: resolve(entry.title, params) ?? "",
    hint: resolve(entry.hint, params),
    severity: entry.severity ?? "error",
    traceId: traceId ?? null,
  };
}

/** Тексты бизнес-правил сервера, которые кассиру удобнее видеть под своим заголовком. */
const MESSAGE_RULES: Array<[RegExp, PosErrorCode]> = [
  // В JS `\w` не матчит кириллицу — окончания перечисляем явно.
  [/кассов[а-яё]* смен/i, "SHIFT_CLOSED"],
  [/промокод/i, "PROMO_REJECTED"],
  [/сертификат/i, "CERTIFICATE_REJECTED"],
  [/бонус/i, "BONUS_REJECTED"],
  [/скидк/i, "DISCOUNT_REJECTED"],
  [/возвра/i, "RETURN_REJECTED"],
  [/остат|недостаточно|нет в наличии|резерв/i, "STOCK_REJECTED"],
];

const isPosUserError = (value: unknown): value is PosUserError =>
  typeof value === "object" &&
  value !== null &&
  "code" in value &&
  "title" in value &&
  typeof (value as PosUserError).title === "string";

/** Похоже на текст для человека, а не на стек или английское исключение. */
const readable = (text: string) => /[а-яё]/i.test(text) && text.length <= 300;

/**
 * Любую ошибку (ответ API, сетевой сбой, строку, уже готовую ошибку каталога)
 * превращает в ошибку для кассира.
 */
export function toPosUserError(error: unknown): PosUserError {
  if (isPosUserError(error)) return error;
  if (typeof error === "string") {
    const rule = MESSAGE_RULES.find(([pattern]) => pattern.test(error));
    return rule ? posError(rule[1], { message: error }) : posError("VALIDATION", { message: error });
  }
  if (error instanceof ApiError) {
    const traceId = getErrorTraceId(error);
    const code = getErrorCode(error);
    const text = error.message;
    if (error.status === 0) return posError("NETWORK");
    if (error.status === 401) return posError("SESSION_EXPIRED");
    if (code === "MODULE_DISABLED") return posError("MODULE_DISABLED");
    if (error.status === 403) return posError("FORBIDDEN");
    if (error.status === 404) return posError("NOT_FOUND");
    if (error.status === 409) return posError("CONFLICT", {}, traceId);
    if (error.status === 429) return posError("RATE_LIMIT");
    if (error.status >= 500) return posError("SERVER", {}, traceId);
    const rule = readable(text) ? MESSAGE_RULES.find(([pattern]) => pattern.test(text)) : undefined;
    if (rule) return posError(rule[1], { message: text });
    return posError("VALIDATION", readable(text) ? { message: text } : {});
  }
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) return posError("NETWORK");
  if (error instanceof Error && readable(error.message)) return posError("VALIDATION", { message: error.message });
  return posError("UNKNOWN");
}

/** Одной строкой — для мест, где помещается только текст (подпись в диалоге). */
export const formatPosError = (error: PosUserError) =>
  error.hint ? `${error.title}. ${error.hint}` : error.title;
