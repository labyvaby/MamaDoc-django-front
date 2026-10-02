/**
 * Согласие гостя на хранение и обработку персональных данных — текст, который
 * ресепшен показывает (и печатает на подпись) до того, как прикрепить и
 * распознать паспорт. Текст правится в настройках объекта и хранится на
 * сервере (GET/PUT …/consent-template/, контракт docs/hotel-backend-tasks.md
 * §15); пока сервер отвечает 404 — шаблон ниже или своя редакция на этом
 * устройстве (hotelDemoStore). Подстановки и версии проверяются тестами
 * (hotelConsent.test.ts).
 */
import { useQuery } from "@tanstack/react-query";

import { ApiError } from "../api/client";
import { getConsentTemplate, type HotelConsentTemplate } from "../api/hotel";
import { DEMO_KEYS, readDemo, useDemoValue, writeDemo } from "./hotelDemoStore";

export interface ConsentTemplate {
  title: string;
  /** Абзацы через пустую строку; подстановки — CONSENT_PLACEHOLDERS. */
  body: string;
  /** "1.0", "1.1"… — растёт при каждом сохранении, чтобы было видно, на какой редакции гость согласился. */
  version: string;
  /** null — стандартный шаблон, ещё не правили. */
  updatedAt: string | null;
}

export const CONSENT_PLACEHOLDERS = [
  { token: "{отель}", label: "Название отеля" },
  { token: "{юрлицо}", label: "Юрлицо" },
  { token: "{адрес}", label: "Адрес" },
] as const;

export const DEFAULT_CONSENT: ConsentTemplate = {
  title: "Согласие на хранение и обработку персональных данных",
  version: "1.0",
  updatedAt: null,
  body: [
    "Я, гость отеля «{отель}», в соответствии с Законом Кыргызской Республики «Об информации персонального характера» от 14 апреля 2008 года № 58 даю согласие {юрлицо} (адрес: {адрес}) на сбор, запись, хранение, уточнение, использование и уничтожение моих персональных данных.",
    "Состав данных: фамилия, имя, отчество; дата и место рождения; пол; гражданство; данные документа, удостоверяющего личность, в том числе его фото или скан; адрес регистрации; телефон и электронная почта; сведения о проживании и оплатах.",
    "Цели обработки: оформление и исполнение договора о проживании, регистрация гостя и миграционный учёт, бухгалтерский и налоговый учёт, связь со мной по вопросам бронирования, безопасность гостей.",
    "Фото документа используется для автоматического заполнения анкеты и хранится в защищённой системе отеля. Доступ к данным есть только у сотрудников, которым он нужен по работе.",
    "Данные передаются третьим лицам только в случаях, предусмотренных законодательством Кыргызской Республики, в том числе уполномоченным государственным органам.",
    "Срок хранения — срок проживания и пять лет после выезда, если закон не требует иного. Согласие действует до его отзыва; отозвать его можно письменным заявлением на ресепшене или по адресу отеля.",
  ].join("\n\n"),
};

export interface ConsentVars {
  hotel: string;
  legalName?: string | null;
  address?: string | null;
}

/** Текст с подстановками: пустое юрлицо — «владелец отеля «…»», пустой адрес — «указан на ресепшене». */
export function renderConsent(text: string, vars: ConsentVars): string {
  const hotel = vars.hotel.trim() || "отеля";
  return text
    .replaceAll("{отель}", hotel)
    .replaceAll("{юрлицо}", vars.legalName?.trim() || `владельцу отеля «${hotel}»`)
    .replaceAll("{адрес}", vars.address?.trim() || "указан на ресепшене");
}

/**
 * Чего не хватает, чтобы назвать в согласии оператора персональных данных.
 * Пока список не пуст, бланк не печатается: подставлять «владелец отеля» и
 * «указан на ресепшене» в юридический документ нельзя.
 */
export const consentOperatorGaps = (vars: ConsentVars): string[] =>
  [!vars.legalName?.trim() && "юридическое название", !vars.address?.trim() && "адрес"].filter((x): x is string => Boolean(x));

/** Абзацы для показа и печати: пустые строки — разделители, лишние пробелы по краям убраны. */
export const consentParagraphs = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/** "1.0" → "1.1", "1.9" → "1.10", что-то непонятное → "1.0". */
export function nextConsentVersion(version: string): string {
  const m = /^(\d+)\.(\d+)$/.exec(version.trim());
  return m ? `${m[1]}.${Number(m[2]) + 1}` : "1.0";
}

export function readConsentTemplate(propertyId: number): ConsentTemplate {
  return readDemo<ConsentTemplate | null>(DEMO_KEYS.consent(propertyId), null) ?? DEFAULT_CONSENT;
}

/** Сохранить свою редакцию (null — вернуть стандартный шаблон, но с новой версией). */
export function saveConsentTemplate(propertyId: number, draft: { title: string; body: string } | null): ConsentTemplate {
  const current = readConsentTemplate(propertyId);
  const next: ConsentTemplate = {
    ...(draft ? { title: draft.title.trim() || DEFAULT_CONSENT.title, body: draft.body.trim() } : { title: DEFAULT_CONSENT.title, body: DEFAULT_CONSENT.body }),
    version: nextConsentVersion(current.version),
    updatedAt: new Date().toISOString(),
  };
  writeDemo(DEMO_KEYS.consent(propertyId), next);
  return next;
}

/** Ответ сервера → редакция для показа: своей нет — стандартный шаблон с версией сервера. */
export function fromServer(t: HotelConsentTemplate): ConsentTemplate {
  return t.body?.trim()
    ? { title: t.title?.trim() || DEFAULT_CONSENT.title, body: t.body, version: t.version ?? DEFAULT_CONSENT.version, updatedAt: t.updatedAt }
    : { ...DEFAULT_CONSENT, version: t.version ?? DEFAULT_CONSENT.version, updatedAt: t.updatedAt };
}

export const consentQueryKey = (propertyId: number | undefined) => ["hotel", "consentTemplate", propertyId] as const;

/** Сервер ответил 404 — до перезагрузки страницы не спрашиваем, работаем в демо. */
let consentEndpointMissing = false;

export interface ConsentState {
  template: ConsentTemplate;
  /** server — текст общий; demo — на этом устройстве; loading — ждём сервер; error — сервер ответил ошибкой. */
  source: "server" | "demo" | "loading" | "error";
  /** Сервер уже хранит текст, своей редакции у него нет, а на устройстве осталась демо-редакция. */
  leftover: ConsentTemplate | null;
}

/** Текущая редакция объекта — с подпиской: сохранили в настройках — сразу видно в формах. */
export function useConsentState(propertyId: number | undefined): ConsentState {
  const demo = useDemoValue<ConsentTemplate | null>(propertyId != null ? DEMO_KEYS.consent(propertyId) : null, null);
  const query = useQuery({
    queryKey: consentQueryKey(propertyId),
    enabled: propertyId != null && !consentEndpointMissing,
    staleTime: 5 * 60_000,
    retry: false,
    placeholderData: undefined,
    queryFn: async ({ signal }) => {
      try {
        return await getConsentTemplate(propertyId!, signal);
      } catch (err) {
        if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
          consentEndpointMissing = true;
          return null;
        }
        throw err;
      }
    },
  });
  if (query.data) {
    return { template: fromServer(query.data), source: "server", leftover: !query.data.body?.trim() && demo ? demo : null };
  }
  const missing = query.data === null || consentEndpointMissing || propertyId == null;
  return {
    template: demo ?? DEFAULT_CONSENT,
    source: missing ? "demo" : query.isError ? "error" : "loading",
    leftover: null,
  };
}

export const useConsentTemplate = (propertyId: number | undefined): ConsentTemplate => useConsentState(propertyId).template;
