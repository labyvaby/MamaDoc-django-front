import React from "react";
import { Alert, Box, Typography } from "@mui/material";
import { useSearchParams } from "react-router";

import { PublicVerticalProvider, useT } from "../../i18n/VerticalProvider";
import { primaryPhone } from "../public-booking/useBookingOrg";
import { useBookingOrgSlug } from "../public-booking/orgSlug";
import { SiteContainer, SiteShell, type SiteNavItem } from "./shell";
import { LANDING_PREVIEW_PARAM, type LandingBlock, type LandingConfig } from "./landingConfig";
import { useLandingConfig, useLandingData, useLandingReviews } from "./useLandingData";
import { Hero } from "./blocks/Hero";
import { About } from "./blocks/About";
import { Directions } from "./blocks/Directions";
import { Services } from "./blocks/Services";
import { Specialists } from "./blocks/Specialists";
import { Branches } from "./blocks/Branches";
import { Reviews } from "./blocks/Reviews";
import { Cta } from "./blocks/Cta";

/**
 * Лендинг организации — `/site` и `/site/<slug>`.
 *
 * Сайт-визитка, собранная из данных CRM: услуги с ценами, команда, адреса,
 * отзывы и свободные окна приходят из того же публичного API, что кормит витрину
 * записи (`/api/v1`, см. `src/api/publicBooking.ts`). Отдельного контента,
 * который надо поддерживать вручную, здесь нет — цену поменяли в прайсе, и на
 * сайте она поменялась.
 *
 * Что настраивается в CRM («Настройки» → «Сайт») — слоган, «о нас», часы работы,
 * соцсети, набор блоков и акцентный цвет; всё остальное только читается.
 *
 * Универсальность: страница не знает слова «клиника». Терминология берётся из
 * глоссария вертикали организации (`clinic` → «врачи», «приёмы»; `beauty` →
 * «мастера», «визиты»), поэтому один и тот же код обслуживает клинику, салон и
 * любую следующую вертикаль — достаточно профиля в `src/locales/glossary/`.
 */

/** Блок лендинга: включён ли он и что показывает. */
interface BlockRender {
  key: LandingBlock;
  /** Пункт меню; `null` — блок в навигацию не попадает (финальный призыв). */
  nav: SiteNavItem | null;
  /**
   * Есть ли блоку что показать. Отдельно от `render`, потому что решение
   * принимается до отрисовки: от него зависят и пункты меню, и чередование фона.
   */
  available: boolean;
  render: (tinted: boolean) => React.ReactNode;
}

const LandingPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const data = useLandingData();
  const { org } = data;

  const previewMode = searchParams.get(LANDING_PREVIEW_PARAM) === "1";
  const config = useLandingConfig(org.organization, previewMode);

  // Вертикаль из адреса (`?vertical=beauty`) — демонстрационный режим: показать
  // тот же сайт терминами салона, не заводя организацию другой вертикали.
  // Терминологию он меняет, данные — нет, поэтому безопасен и на проде.
  // Обычный источник — поле `vertical` организации из публичного API.
  const verticalOverride = searchParams.get("vertical");

  // Провайдер стоит выше всей страницы: подписи меню и состав блоков считаются
  // до оболочки, и без этого меню осталось бы с терминами клиники.
  return (
    <PublicVerticalProvider vertical={verticalOverride || org.organization?.vertical}>
      <LandingBody data={data} config={config} previewMode={previewMode} />
    </PublicVerticalProvider>
  );
};

const LandingBody: React.FC<{
  data: ReturnType<typeof useLandingData>;
  config: LandingConfig;
  previewMode: boolean;
}> = ({ data, config, previewMode }) => {
  const orgSlug = useBookingOrgSlug();
  const { org, specialists, loaded } = data;

  // Отзывы — отдельные запросы по специалистам, поэтому только для включённого
  // блока (см. useLandingReviews).
  const reviewsEnabled = config.blocks.reviews && loaded;
  const { reviews, loading: reviewsLoading } = useLandingReviews(specialists, reviewsEnabled);

  const blocks = useVisibleBlocks({ config, data, reviews, reviewsLoading, orgSlug });
  const sections = blocks.map((b) => b.nav).filter((n): n is SiteNavItem => Boolean(n));

  return (
    <SiteShell org={org} config={config} sections={sections}>
      {previewMode && <PreviewBanner />}
      <Hero data={data} tagline={config.tagline} />
      {/* Фон секций чередуется, поэтому оттенок зависит от позиции, а не от
          самого блока: владелец выключил «Отзывы» — полосы не съезжают. */}
      {blocks.map((block, index) => (
        <React.Fragment key={block.key}>{block.render(index % 2 === 0)}</React.Fragment>
      ))}
      {org.loaded && !org.organization && <OrgNotFound />}
    </SiteShell>
  );
};

/** Состав и порядок блоков. Порядок фиксирован — задаёт его `LANDING_BLOCKS`. */
function useVisibleBlocks(args: {
  config: LandingConfig;
  data: ReturnType<typeof useLandingData>;
  reviews: ReturnType<typeof useLandingReviews>["reviews"];
  reviewsLoading: boolean;
  orgSlug: string;
}): BlockRender[] {
  const { config, data, reviews, reviewsLoading, orgSlug } = args;
  const { t } = useT("landing");
  const { org, services, specialists, loaded } = data;
  const phone = primaryPhone(org.branches);

  const all: BlockRender[] = [
    {
      key: "about",
      nav: { id: "about", label: t("nav.about") },
      // Текст пишет владелец: без него блок не имеет содержимого.
      available: Boolean(config.about),
      render: (tinted) => <About id="about" text={config.about} tinted={tinted} />,
    },
    {
      key: "directions",
      nav: { id: "directions", label: t("nav.directions") },
      available: true,
      render: (tinted) => <Directions id="directions" tinted={tinted} />,
    },
    {
      key: "services",
      nav: { id: "services", label: t("nav.services") },
      available: true,
      render: (tinted) => (
        <Services
          id="services"
          services={services}
          loading={!loaded}
          orgSlug={orgSlug}
          tinted={tinted}
        />
      ),
    },
    {
      key: "specialists",
      nav: { id: "specialists", label: t("nav.specialists") },
      available: true,
      render: (tinted) => (
        <Specialists
          id="specialists"
          specialists={specialists}
          loading={!loaded}
          orgSlug={orgSlug}
          tinted={tinted}
        />
      ),
    },
    {
      key: "branches",
      nav: { id: "branches", label: t("nav.branches") },
      available: true,
      render: (tinted) => (
        <Branches id="branches" branches={org.branches} loading={!org.loaded} tinted={tinted} />
      ),
    },
    {
      key: "reviews",
      nav: { id: "reviews", label: t("nav.reviews") },
      // Пустая лента отзывов — обычное дело для новой организации: секцию с
      // заголовком «Отзывы» и подписью «пока нет» на сайте показывать незачем.
      available: reviewsLoading || reviews.length > 0,
      render: (tinted) => (
        <Reviews id="reviews" reviews={reviews} loading={reviewsLoading} tinted={tinted} />
      ),
    },
    {
      key: "cta",
      nav: null,
      available: true,
      render: () => <Cta id="cta" orgSlug={orgSlug} phone={phone} />,
    },
  ];

  // Блок остаётся в списке, только если владелец его не выключил и ему есть что
  // показать: пункт меню, ведущий в пустоту, хуже отсутствующего пункта.
  return all.filter((block) => config.blocks[block.key] && block.available);
}

/** Плашка предпросмотра — только при `?preview=1` из настроек CRM. */
const PreviewBanner: React.FC = () => {
  const { t } = useT("landing");
  return (
    <SiteContainer>
      <Alert severity="info" sx={{ mt: 2, borderRadius: 2 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{t("preview.badge")}</Typography>
        <Typography sx={{ fontSize: 13 }}>{t("preview.hint")}</Typography>
      </Alert>
    </SiteContainer>
  );
};

/**
 * Организации с таким адресом нет. Витрина записи в этом случае просто пустая, а
 * лендинг открывают по ссылке из рекламы — гостю нужно объяснить, что ссылка
 * ведёт не туда.
 */
const OrgNotFound: React.FC = () => {
  const { t } = useT("publicBooking");
  return (
    <SiteContainer>
      <Box sx={{ py: 6 }}>
        <Alert severity="warning">{t("notFound")}</Alert>
      </Box>
    </SiteContainer>
  );
};

export default LandingPage;
