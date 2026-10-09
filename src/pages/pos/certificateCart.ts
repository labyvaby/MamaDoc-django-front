import dayjs from "dayjs";

import type {
  PosCertificateInput,
  PosCheckoutResponse,
  PosClientCertificate,
  PosReceiptDebt,
  PosSavedReceipt,
} from "../../api/pos";
import type { GiftCertificateDetail } from "../../api/promotions";
import { amountToCents, centsToAmount } from "../certificates/certificateMeta";
import { formatPosAmount } from "./format";
import type { PosClient } from "./types";

/**
 * Сертификаты v2 на кассе: сертификат продаётся строкой текущего чека и
 * оплачивается вместе с товарами. Здесь — чистая логика без React: строка
 * сертификата в чеке, проверка формы продажи, подписи подарочной карты и
 * разбор ответа checkout/.
 */

/** Строка «Подарочный сертификат» в чеке кассы. */
export type PosCertificateDraft = {
  /** Локальный ключ строки — по нему её удаляют из чека. */
  key: string;
  client: Pick<PosClient, "id" | "name" | "phone">;
  /** Номинал в копейках — без ошибок округления при сумме чека. */
  nominalCents: number;
  /** Последний день действия, YYYY-MM-DD; null — бессрочный. */
  expiresOn: string | null;
  noExpiry: boolean;
  comment: string;
  /**
   * Номер с карты (уже нормализованный). Пусто или нет поля (черновик,
   * сохранённый до появления номера) — номер выдаст CRM при оплате.
   */
  code?: string;
};

/** Предел номинала на кассе: опечатка «500000000» не должна уйти в чек. */
export const MAX_CERTIFICATE_NOMINAL_CENTS = 10_000_000 * 100;

/** Длина `GiftCertificate.code` на сервере. */
export const MAX_CERTIFICATE_CODE_LENGTH = 80;

/**
 * Номер сертификата как его хранит сервер: без пробелов, в верхнем регистре
 * (`normalize_certificate_code`). Сканер может дописать Enter/Tab или
 * служебный символ GS1 — управляющие символы тоже выбрасываем.
 */
export const normalizeCertificateCode = (value: string | null | undefined): string =>
  // eslint-disable-next-line no-control-regex
  (value ?? "").replace(/[\s\u0000-\u001f\u007f]+/g, "").toUpperCase();

export const certificateDraftsTotalCents = (drafts: readonly PosCertificateDraft[]): number =>
  drafts.reduce((total, draft) => total + draft.nominalCents, 0);

/** Строки чека → `certificates` в quote/ и checkout/. Номер — только если введён. */
export const toCertificateInputs = (drafts: readonly PosCertificateDraft[]): PosCertificateInput[] =>
  drafts.map((draft) => {
    const code = normalizeCertificateCode(draft.code);
    return {
      clientId: Number(draft.client.id),
      nominal: centsToAmount(draft.nominalCents),
      expiresOn: draft.noExpiry ? null : draft.expiresOn,
      noExpiry: draft.noExpiry,
      comment: draft.comment.trim(),
      ...(code ? { code } : {}),
    };
  });

/**
 * Старый бэкенд не знает `certificates[].code` и молча выдаст свой номер.
 * Новый эхом возвращает `code` в каждой строке quote/ — нет поля при
 * введённом номере значит «номер с карты потеряется».
 */
export const certificateCodesUnsupported = (
  drafts: readonly PosCertificateDraft[],
  quoted: ReadonlyArray<{ code?: string }> | undefined,
): boolean =>
  Boolean(quoted) &&
  drafts.some((draft, index) => Boolean(normalizeCertificateCode(draft.code)) && quoted?.[index]?.code === undefined);

/**
 * Ошибки номера по строкам чека из ответа сервера:
 * `details.fields["certificates.N.code"]` → `{ N: текст }`.
 */
export const certificateCodeErrors = (fields: Record<string, string> | null | undefined): Record<number, string> => {
  const out: Record<number, string> = {};
  for (const [key, text] of Object.entries(fields ?? {})) {
    const match = /^certificates\.(\d+)\.code$/.exec(key);
    if (match) out[Number(match[1])] = text;
  }
  return out;
};

/** Что известно о номере в окне продажи. */
export type CertificateCodeStatus = "empty" | "invalid" | "inCart" | "checking" | "free" | "taken" | "unknown";

export type CertificateFormValues = {
  buyer: PosClient | null;
  nominal: string;
  expiresOn: string;
  noExpiry: boolean;
  /** Номер с карты; необязателен. */
  code?: string;
  /** Номера, которые уже лежат в этом чеке. */
  codesInCart?: readonly string[];
};

export type CertificateFormErrors = Partial<Record<"buyer" | "nominal" | "expiresOn" | "code", string>>;

/**
 * Состояние номера в окне продажи. `checkedCode` — номер, по которому уже
 * спросили `lookup/` (ввод с задержкой); пока он отстаёт от введённого,
 * номер «проверяется». `lookup`: found — 200 (занят), missing — 404
 * (свободен), error — проверить не удалось (решит сервер при quote/).
 */
export const resolveCertificateCodeStatus = (input: {
  code: string;
  checkedCode: string;
  localError?: string;
  inCart?: boolean;
  lookup: "pending" | "found" | "missing" | "error";
}): CertificateCodeStatus => {
  const code = normalizeCertificateCode(input.code);
  if (!code) return "empty";
  if (input.inCart) return "inCart";
  if (input.localError) return "invalid";
  if (normalizeCertificateCode(input.checkedCode) !== code || input.lookup === "pending") return "checking";
  if (input.lookup === "found") return "taken";
  if (input.lookup === "missing") return "free";
  return "unknown";
};

/** Проверка номера без сервера: длина и повтор в чеке. */
export const validateCertificateCode = (code: string, codesInCart: readonly string[] = []): string | undefined => {
  const normalized = normalizeCertificateCode(code);
  if (!normalized) return undefined;
  if (normalized.length > MAX_CERTIFICATE_CODE_LENGTH)
    return `Номер не длиннее ${MAX_CERTIFICATE_CODE_LENGTH} символов.`;
  if (codesInCart.some((item) => normalizeCertificateCode(item) === normalized)) return "Этот номер уже есть в чеке.";
  return undefined;
};

/**
 * Проверка окна продажи. `touched` — поля, которые кассир уже трогал:
 * пустую форму не красим ошибками до первого ввода или нажатия «Далее».
 */
export const validateCertificateForm = (
  values: CertificateFormValues,
  today: string = dayjs().format("YYYY-MM-DD"),
): CertificateFormErrors => {
  const errors: CertificateFormErrors = {};
  if (!values.buyer) errors.buyer = "Выберите покупателя — сертификат выдаётся на клиента.";
  const cents = amountToCents(values.nominal);
  if (!values.nominal.trim()) errors.nominal = "Укажите сумму сертификата.";
  else if (!Number.isFinite(cents) || cents <= 0) errors.nominal = "Сумма должна быть больше нуля.";
  else if (cents > MAX_CERTIFICATE_NOMINAL_CENTS)
    errors.nominal = `Не больше ${formatPosAmount(MAX_CERTIFICATE_NOMINAL_CENTS / 100)} сом.`;
  if (!values.noExpiry) {
    if (!values.expiresOn) errors.expiresOn = "Укажите дату или отметьте «Бессрочно».";
    else if (!formatIsoDay(values.expiresOn)) errors.expiresOn = "Неверная дата.";
    else if (values.expiresOn < today) errors.expiresOn = "Дата не может быть в прошлом.";
  }
  const code = validateCertificateCode(values.code ?? "", values.codesInCart);
  if (code) errors.code = code;
  return errors;
};

/** Ввод суммы → копейки; «5 000», «5000,5» и «5000.50» понимаются одинаково. */
export const nominalInputToCents = (value: string): number => amountToCents(value);

/**
 * Кегль номера на подарочной карте по длине (в `cqw` от ширины карты).
 * Короткий номер — крупно и разреженно, как тиснение; длинный мельчает и в
 * крайнем случае переносится на вторую строку, а не выезжает за край карты
 * (на телефоне 360 px карта ~330 px шириной).
 */
export const giftCardCodeSize = (length: number): { fontSize: string; letterSpacing: string } =>
  length <= 14
    ? { fontSize: "3.6cqw", letterSpacing: ".2em" }
    : length <= 22
      ? { fontSize: "3cqw", letterSpacing: ".12em" }
      : { fontSize: "2.5cqw", letterSpacing: ".04em" };

/** Сумма на подарочной карте: «5 000»; пусто или ошибка — «0». */
export const giftCardAmountLabel = (cents: number): string =>
  Number.isFinite(cents) && cents > 0 ? formatPosAmount(Math.round(cents) / 100) : "0";

/** «07.10.2027» из YYYY-MM-DD; null — если даты нет или она битая. */
export const formatIsoDay = (value: string | null | undefined): string | null => {
  if (!value) return null;
  // Без customParseFormat: dayjs молча «чинит» 2027-02-31 — сверяем обратно.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const day = dayjs(value);
  return day.isValid() && day.format("YYYY-MM-DD") === value ? day.format("DD.MM.YYYY") : null;
};

/** Срок на карте и в строке чека: «до 07.10.2027» или «бессрочно». */
export const giftCardExpiryLabel = (noExpiry: boolean, expiresOn: string | null | undefined): string => {
  if (noExpiry) return "бессрочно";
  const day = formatIsoDay(expiresOn);
  return day ? `до ${day}` : "срок не указан";
};

/**
 * Имя на карте: «Айгерим Токтосунова» → «АЙГЕРИМ ТОКТОСУНОВА». Длинное ФИО
 * сокращаем до имени и фамилии — на карте должна остаться одна строка.
 */
export const giftCardHolderName = (name: string | null | undefined): string => {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return parts.slice(0, 2).join(" ").toLocaleUpperCase("ru-RU");
};

/** Сертификаты покупателя, которыми можно платить сейчас: сначала те, что скоро сгорят. */
export const payableCertificates = (list: readonly PosClientCertificate[] | undefined): PosClientCertificate[] =>
  [...(list ?? [])]
    .filter((item) => item.usable && item.status === "active" && Number(item.balance) > 0)
    .sort((left, right) => {
      if (left.expiresAt === right.expiresAt) return left.id - right.id;
      if (!left.expiresAt) return 1;
      if (!right.expiresAt) return -1;
      return left.expiresAt < right.expiresAt ? -1 : 1;
    });

/**
 * Сколько сертификат покроет и что останется доплатить. Сертификатом платят
 * только за товары: купить сертификат сертификатом нельзя.
 */
export const certificateCoverage = (balance: number, goodsDue: number) => {
  const covered = Math.max(0, Math.min(balance, goodsDue));
  return { covered: Math.round(covered * 100) / 100, rest: Math.round((goodsDue - covered) * 100) / 100 };
};

export type PosSaleResult = {
  /** Товарный чек; null — в чеке были только сертификаты. */
  receipt: PosSavedReceipt | null;
  certificates: GiftCertificateDetail[];
  /** Долг покупателя, открытый чеком при оплате «в долг». */
  debt?: PosReceiptDebt | null;
};

/** Ответ checkout/ → чек (если был) и проданные сертификаты. */
export const normalizeCheckoutResult = (raw: PosCheckoutResponse | PosSavedReceipt): PosSaleResult => {
  const response = raw as PosCheckoutResponse;
  const certificates = Array.isArray(response.soldCertificates) ? response.soldCertificates : [];
  // Долг — только когда бэк его открыл: старый ответ и чек без долга поля не несут.
  const debt = response.debt && typeof response.debt === "object" ? { debt: response.debt } : {};
  if (response.receipt && typeof response.receipt === "object" && response.receipt.id != null) {
    return { receipt: response.receipt, certificates, ...debt };
  }
  const hasReceipt = response.id != null && Array.isArray(response.lines);
  return { receipt: hasReceipt ? (response as PosSavedReceipt) : null, certificates, ...debt };
};

/** «Отложить» недоступно, пока в чеке есть сертификат: сервер такой чек не отложит. */
export const HOLD_BLOCKED_BY_CERTIFICATE = "Чек с сертификатом нельзя отложить";
