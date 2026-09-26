import React from "react";

import {
  getOrganizationProfessionals,
  getOrganizationServices,
  getOrganizationReviews,
  type OrganizationReview,
  type ProfessionalPreview,
  type PublicService,
} from "../../api/publicBooking";
import { isAbortError } from "../../api/client";
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
 * попавшем в топ, на сайт не приходил). `/organizations/<slug>/reviews/`
 * отдаёт опубликованные отзывы всей организации, свежие сверху; на тесте она
 * с 03.09.2026, на проде проверена 10.09.2026 — фолбэк по врачам удалён.
 *
 * Грузим только когда блок действительно показывается (`enabled`): первый
 * экран пациент часто закрывает кнопкой «Записаться», не долистав до отзывов.
 */
export function useLandingReviews(
  enabled: boolean,
): { reviews: LandingReview[]; loading: boolean } {
  const orgSlug = useBookingOrgSlug();
  const [reviews, setReviews] = React.useState<LandingReview[]>([]);
  const [loading, setLoading] = React.useState(false);

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
  }, [enabled, orgSlug]);

  return { reviews, loading };
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
