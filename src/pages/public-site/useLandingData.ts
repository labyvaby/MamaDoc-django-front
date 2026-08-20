import React from "react";

import {
  getOrganizationProfessionals,
  getOrganizationServices,
  getProfessionalReviews,
  idOrSlugRef,
  type ProfessionalPreview,
  type ProfessionalReview,
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

/**
 * Сколько специалистов опрашиваем ради блока отзывов. Публичной ручки «отзывы
 * организации» в контракте нет — только `/professionals/<id>/reviews/`, поэтому
 * лента склеивается из отзывов первых специалистов списка (бэк сортирует его по
 * загруженности, то есть сверху те, к кому реально ходят). Ограничение — чтобы
 * первый экран не тянул за собой десяток запросов; агрегированная ручка
 * заказана тикетом `MamaDoc/backend_ticket_public_landing.md` §3.
 */
const REVIEW_SOURCE_LIMIT = 5;

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

/** Отзыв в ленте лендинга: к тексту добавляем, к кому ходили. */
export interface LandingReview extends ProfessionalReview {
  specialistName: string;
  specialistSlug: string;
}

/**
 * Отзывы для блока «Отзывы». Грузятся отдельным хуком и только когда блок
 * действительно показывается (`enabled`): это несколько запросов, и вешать их
 * на первый экран, который пациент часто закрывает на кнопке «Записаться»,
 * незачем.
 */
export function useLandingReviews(
  specialists: ProfessionalPreview[],
  enabled: boolean,
): { reviews: LandingReview[]; loading: boolean } {
  const [reviews, setReviews] = React.useState<LandingReview[]>([]);
  const [loading, setLoading] = React.useState(false);

  // Ключ по составу источников: список специалистов пересоздаётся при каждом
  // рендере родителя, и без него эффект зацикливался бы на самом себе.
  const sources = specialists.slice(0, REVIEW_SOURCE_LIMIT);
  const sourcesKey = sources.map((s) => s.id).join(",");

  React.useEffect(() => {
    if (!enabled || !sourcesKey) {
      setReviews([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);

    Promise.all(
      sources.map((specialist) =>
        getProfessionalReviews(idOrSlugRef(specialist), { limit: 5 }, controller.signal)
          .then((r) =>
            r.items.map<LandingReview>((review) => ({
              ...review,
              specialistName: specialist.fullName,
              specialistSlug: String(idOrSlugRef(specialist)),
            })),
          )
          .catch((e) => {
            if (isAbortError(e)) throw e;
            return [] as LandingReview[];
          }),
      ),
    )
      .then((lists) => {
        const merged = lists
          .flat()
          // Свежие сверху: у разных специалистов отзывы приходят своими лентами.
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, REVIEWS_PREVIEW);
        setReviews(merged);
        setLoading(false);
      })
      .catch(() => {
        // Отмена — уходим молча, страница уже размонтирована.
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sourcesKey]);

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
