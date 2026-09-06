import React from "react";

import {
  getOrganizationProfessionals,
  getOrganizationServices,
  getOrganizationReviews,
  getProfessionalReviews,
  idOrSlugRef,
  type OrganizationReview,
  type ProfessionalPreview,
  type PublicService,
} from "../../api/publicBooking";
import { ApiError, isAbortError } from "../../api/client";
import { useBookingOrgSlug } from "../public-booking/orgSlug";
import { parseLandingConfig, readLandingPreview, type LandingConfig } from "./landingConfig";
import { useBookingOrg, type BookingOrg } from "../public-booking/useBookingOrg";

/**
 * Данные лендинга. Организацию и филиалы берём тем же хуком, что и витрина
 * записи, — у них общий модульный кэш, поэтому переход «лендинг → запись» не
 * перезапрашивает клинику.
 */

/** Сколько карточек показываем в блоке — лендинг не каталог. */
export const SPECIALISTS_PREVIEW = 8;
export const SERVICES_PREVIEW = 9;
export const REVIEWS_PREVIEW = 6;

export interface LandingData {
  org: BookingOrg;
  services: PublicService[];
  specialists: ProfessionalPreview[];
  /** Запрос услуг и специалистов завершён (успехом или неудачей). */
  loaded: boolean;
}

export function useLandingData(): LandingData {
  const orgSlug = useBookingOrgSlug();
  const org = useBookingOrg();
  const [services, setServices] = React.useState<PublicService[]>([]);
  const [specialists, setSpecialists] = React.useState<ProfessionalPreview[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    const controller = new AbortController();
    setServices([]);
    setSpecialists([]);
    setLoaded(false);

    Promise.all([
      getOrganizationServices(orgSlug, controller.signal)
        .then((r) => r.items)
        .catch((e) => {
          if (isAbortError(e)) throw e;
          return [] as PublicService[];
        }),
      getOrganizationProfessionals(orgSlug, { limit: 24 }, controller.signal)
        .then((r) => r.items)
        .catch((e) => {
          if (isAbortError(e)) throw e;
          return [] as ProfessionalPreview[];
        }),
    ])
      .then(([serviceList, professionalList]) => {
        setServices(serviceList);
        setSpecialists(professionalList);
        setLoaded(true);
      })
      .catch(() => {
        // Отмена при уходе со страницы — состояние трогать нельзя.
      });

    return () => controller.abort();
  }, [orgSlug]);

  return { org, services, specialists, loaded };
}

/**
 * Отзыв в ленте лендинга: к тексту добавляем, к кому ходили.
 *
 * Специалиста бэк отдаёт объектом (или `null`, если его удалили) — в карточке
 * же нужны готовые строки, поэтому раскладываем их здесь.
 */
export interface LandingReview extends OrganizationReview {
  specialistName: string;
  specialistSlug: string;
}

/**
 * Отзывы для блока «Отзывы» — одной организационной ручкой.
 *
 * Раньше лента склеивалась из отзывов первых специалистов списка: несколько
 * запросов на первый экран и заведомо неполная выборка (отзыв о враче, не
 * попавшем в топ, на сайт не приходил). С 03.09.2026 есть
 * `/organizations/<slug>/reviews/` — она отдаёт опубликованные отзывы всей
 * организации, свежие сверху.
 *
 * Грузим только когда блок действительно показывается (`enabled`): первый
 * экран пациент часто закрывает кнопкой «Записаться», не долистав до отзывов.
 */
export function useLandingReviews(
  specialists: ProfessionalPreview[],
  enabled: boolean,
): { reviews: LandingReview[]; loading: boolean } {
  const orgSlug = useBookingOrgSlug();
  const [reviews, setReviews] = React.useState<LandingReview[]>([]);
  const [loading, setLoading] = React.useState(false);

  // Ключ по составу источников фолбэка: список специалистов пересоздаётся при
  // каждом рендере родителя, и без него эффект зацикливался бы на самом себе.
  const sources = specialists.slice(0, REVIEW_SOURCE_LIMIT);
  const sourcesKey = sources.map((s) => s.id).join(",");

  React.useEffect(() => {
    if (!enabled) {
      setReviews([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);

    getOrganizationReviews(orgSlug, { limit: REVIEWS_PREVIEW }, controller.signal)
      .then((r) =>
        r.items.map<LandingReview>((review) => ({
          ...review,
          specialistName: review.professional?.fullName ?? "",
          specialistSlug: review.professional?.slug ?? "",
        })),
      )
      .catch((e) => {
        if (isAbortError(e)) throw e;
        // Ручки ещё нет на этом стенде (на проде 404 на 03.09.2026) — берём
        // отзывы по врачам, как делали до неё.
        if (e instanceof ApiError && e.status === 404) {
          return legacyReviewsByProfessionals(sources, controller.signal);
        }
        // Отзывы — украшение страницы: их отсутствие не повод показывать
        // гостю ошибку, блок просто останется пустым.
        return [] as LandingReview[];
      })
      .then((items) => {
        setReviews(items);
        setLoading(false);
      })
      .catch(() => {
        // Отмена — уходим молча, страница уже размонтирована.
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, orgSlug, sourcesKey]);

  return { reviews, loading };
}

/**
 * Сколько специалистов опрашиваем в фолбэке. Полноценной заменой он не был
 * никогда: отзыв о враче, не попавшем в первые строки списка, на сайт не
 * приходил, — поэтому ограничение и стоит.
 */
const REVIEW_SOURCE_LIMIT = 5;

/**
 * Лента отзывов по первым специалистам — как собиралась до появления
 * организационной ручки. ⚠ Временный код: удалить, когда
 * `/organizations/<slug>/reviews/` будет на всех стендах (на тесте — с
 * 03.09.2026, на проде ещё 404).
 */
function legacyReviewsByProfessionals(
  sources: ProfessionalPreview[],
  signal: AbortSignal,
): Promise<LandingReview[]> {
  if (sources.length === 0) return Promise.resolve([]);
  return Promise.all(
    sources.map((specialist) =>
      getProfessionalReviews(idOrSlugRef(specialist), { limit: 5 }, signal)
        .then((r) =>
          r.items.map<LandingReview>((review) => ({
            ...review,
            professional: null,
            specialistName: specialist.fullName,
            specialistSlug: String(idOrSlugRef(specialist)),
          })),
        )
        .catch((e) => {
          if (isAbortError(e)) throw e;
          return [] as LandingReview[];
        }),
    ),
  ).then((lists) =>
    lists
      .flat()
      // Свежие сверху: у разных специалистов отзывы приходят своими лентами.
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, REVIEWS_PREVIEW),
  );
}

/**
 * Оформление лендинга: правки владельца, если они доступны, иначе — пустой
 * конфиг (сайт целиком из данных CRM).
 *
 * Приоритет: превью из конструктора настроек (только в этой вкладке и только
 * при `?preview=1`) → сохранённое значение из публичного API. Обратный порядок
 * означал бы, что владелец не видит своих правок до деплоя бэка.
 */
export function useLandingConfig(
  organization: { landing?: unknown } | null,
  previewMode: boolean,
): LandingConfig {
  const orgSlug = useBookingOrgSlug();
  const saved = organization?.landing;

  return React.useMemo(() => {
    if (previewMode) {
      const preview = readLandingPreview(orgSlug);
      if (preview) return preview;
    }
    return parseLandingConfig(saved);
  }, [orgSlug, previewMode, saved]);
}
