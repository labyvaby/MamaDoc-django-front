import React from "react";
import {
  Box,
  Button,
  Container,
  CssBaseline,
  Divider,
  GlobalStyles,
  IconButton,
  Link,
  Skeleton,
  Stack,
  Typography,
  alpha,
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";

import { useT } from "../../i18n/VerticalProvider";
import { bookPath } from "../public-booking/orgSlug";
import { formatPhone, monogram, telHref } from "../public-booking/format";
import { primaryPhone, type BookingOrg } from "../public-booking/useBookingOrg";
import { useBookingBrand, useFavicon, usePageMeta } from "../public-booking/shell";
import { SECTION_BG, SITE_BORDER, SITE_MAX_WIDTH, useSiteTheme } from "./theme";
import { LANDING_SOCIALS, socialHref, type LandingConfig } from "./landingConfig";
import { SOCIAL_ICONS, SOCIAL_LABELS } from "./socialMeta";

/**
 * Оболочка лендинга `/site`.
 *
 * Своя, а не `PublicBookingShell`: у витрины записи шапка рабочая (вход в
 * кабинет, стрелка «назад», подпись экрана), а лендингу нужна маркетинговая —
 * навигация по секциям и кнопка записи. Общее — тема, мета-теги, favicon и
 * логотип клиники — переиспользуется из витрины, чтобы сайт и запись не
 * разъезжались.
 */

/** Отступ контейнера — общий с витриной записи. */
const GUTTER = 2;

/** Высота липкой шапки: на неё нужен отступ у якорных секций. */
const HEADER_HEIGHT = 64;

/** Секция лендинга, на которую ведёт пункт меню. */
export interface SiteNavItem {
  id: string;
  label: string;
}

/**
 * Скролл документа и мягкая прокрутка к секциям. CRM держит `html/body/#root`
 * в `overflow: hidden` (внутри staff-layout скроллится свой контейнер), а
 * лендинг рендерится вне layout — без этого страница не скроллилась бы вообще.
 * `scroll-padding-top` — чтобы липкая шапка не накрывала заголовок секции.
 */
const scrollableDocument = (
  <GlobalStyles
    styles={{
      html: {
        height: "auto",
        overflow: "visible",
        scrollBehavior: "smooth",
        scrollPaddingTop: HEADER_HEIGHT + 16,
      },
      body: { height: "auto", minHeight: "100%", overflow: "visible" },
      "#root": { height: "auto", minHeight: "100%", overflow: "visible" },
      "@keyframes siteFadeUp": {
        from: { opacity: 0, transform: "translateY(12px)" },
        to: { opacity: 1, transform: "none" },
      },
    }}
  />
);

/** Контейнер контента — одна ширина на все секции лендинга. */
export const SiteContainer: React.FC<React.PropsWithChildren> = ({ children }) => (
  <Container maxWidth={false} sx={{ maxWidth: SITE_MAX_WIDTH, px: GUTTER }}>
    {children}
  </Container>
);

/**
 * Секция лендинга: заголовок, подзаголовок и содержимое. Чередование фона
 * (`tinted`) отделяет секции друг от друга без рамок и теней.
 */
export const SiteSection: React.FC<
  React.PropsWithChildren<{
    id: string;
    title: string;
    subtitle?: string;
    tinted?: boolean;
    action?: React.ReactNode;
  }>
> = ({ id, title, subtitle, tinted, action, children }) => (
  <Box
    component="section"
    id={id}
    sx={{
      py: { xs: 5, md: 8 },
      ...(tinted ? { bgcolor: SECTION_BG } : null),
    }}
  >
    <SiteContainer>
      <Stack
        direction={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", md: "flex-end" }}
        spacing={1.5}
        sx={{ mb: { xs: 3, md: 4 } }}
      >
        <Box>
          <Typography
            component="h2"
            sx={{ fontSize: { xs: 24, md: 32 }, fontWeight: 700, lineHeight: 1.2 }}
          >
            {title}
          </Typography>
          {subtitle && (
            <Typography sx={{ mt: 1, fontSize: { xs: 14, md: 16 }, color: "text.secondary" }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {action}
      </Stack>
      {children}
    </SiteContainer>
  </Box>
);

// ── Шапка ────────────────────────────────────────────────────────────────────

const SiteHeader: React.FC<{
  org: BookingOrg;
  sections: SiteNavItem[];
  bookHref: string;
}> = ({ org, sections, bookHref }) => {
  const { t } = useT("landing");
  const brand = useBookingBrand(org.organization);
  const [logoBroken, setLogoBroken] = React.useState(false);
  const phone = primaryPhone(org.branches);
  const showLogo = Boolean(brand.logoUrl) && !logoBroken;

  return (
    <Box
      component="header"
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        height: HEADER_HEIGHT,
        display: "flex",
        alignItems: "center",
        bgcolor: "background.paper",
        borderBottom: `1px solid ${SITE_BORDER}`,
      }}
    >
      <SiteContainer>
        <Stack direction="row" alignItems="center" spacing={2}>
          {/* Бренд ведёт на начало страницы, а не на витрину: гость на сайте. */}
          <Stack
            component="a"
            href="#top"
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ minWidth: 0, textDecoration: "none", color: "inherit" }}
          >
            {showLogo ? (
              <Box
                component="img"
                src={brand.logoUrl ?? undefined}
                alt={org.organization?.name ?? ""}
                onError={() => setLogoBroken(true)}
                sx={{ height: 32, maxWidth: 160, objectFit: "contain", display: "block" }}
              />
            ) : org.organization ? (
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12),
                  color: "primary.main",
                }}
              >
                {monogram(org.organization.name)}
              </Box>
            ) : (
              <Skeleton variant="rounded" width={32} height={32} />
            )}
            {org.organization ? (
              <Typography noWrap sx={{ fontSize: 15, fontWeight: 700, maxWidth: 200 }}>
                {org.organization.name}
              </Typography>
            ) : (
              <Skeleton width={120} height={20} />
            )}
          </Stack>

          <Box sx={{ flexGrow: 1 }} />

          {/* Навигация по секциям — только там, где она влезает целиком. */}
          <Stack direction="row" spacing={2.5} sx={{ display: { xs: "none", lg: "flex" } }}>
            {sections.map((section) => (
              <Link
                key={section.id}
                href={`#${section.id}`}
                underline="none"
                sx={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "text.secondary",
                  whiteSpace: "nowrap",
                  "&:hover": { color: "primary.main" },
                }}
              >
                {section.label}
              </Link>
            ))}
          </Stack>

          {phone && (
            <IconButton
              href={telHref(phone)}
              aria-label={t("hero.call")}
              sx={{ display: { xs: "inline-flex", md: "none" }, color: "text.secondary" }}
            >
              <PhoneOutlined fontSize="small" />
            </IconButton>
          )}
          {phone && (
            <Button
              href={telHref(phone)}
              variant="text"
              startIcon={<PhoneOutlined />}
              sx={{
                display: { xs: "none", md: "inline-flex" },
                fontWeight: 600,
                color: "text.primary",
                whiteSpace: "nowrap",
              }}
            >
              {formatPhone(phone)}
            </Button>
          )}
          <Button
            href={bookHref}
            variant="contained"
            disableElevation
            sx={{ borderRadius: 99, px: { xs: 2, md: 3 }, fontWeight: 700, whiteSpace: "nowrap" }}
          >
            {t("nav.book")}
          </Button>
        </Stack>
      </SiteContainer>
    </Box>
  );
};

// ── Подвал ───────────────────────────────────────────────────────────────────

const SiteFooter: React.FC<{
  org: BookingOrg;
  config: LandingConfig;
  sections: SiteNavItem[];
  bookHref: string;
}> = ({ org, config, sections, bookHref }) => {
  const { t } = useT("landing");
  const socials = LANDING_SOCIALS.map((kind) => ({
    kind,
    href: socialHref(kind, config.socials[kind]),
  })).filter((s): s is { kind: typeof s.kind; href: string } => Boolean(s.href));

  return (
    <Box component="footer" sx={{ bgcolor: SECTION_BG, pt: { xs: 5, md: 7 }, pb: 3 }}>
      <SiteContainer>
        <Box
          sx={{
            display: "grid",
            gap: { xs: 4, md: 6 },
            gridTemplateColumns: { xs: "1fr", md: "1.2fr 1fr 1fr" },
          }}
        >
          <Stack spacing={1.5}>
            <Typography sx={{ fontSize: 18, fontWeight: 700 }}>
              {org.organization?.name ?? ""}
            </Typography>
            {config.workHours && (
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <ScheduleOutlined sx={{ fontSize: 18, color: "text.secondary", mt: "2px" }} />
                <Box>
                  <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                    {t("footer.workHours")}
                  </Typography>
                  <Typography sx={{ fontSize: 14 }}>{config.workHours}</Typography>
                </Box>
              </Stack>
            )}
            {socials.length > 0 && (
              <Stack direction="row" spacing={1} sx={{ pt: 0.5 }}>
                {socials.map(({ kind, href }) => {
                  const Icon = SOCIAL_ICONS[kind];
                  return (
                    <IconButton
                      key={kind}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={SOCIAL_LABELS[kind]}
                      size="small"
                      sx={{
                        border: `1px solid ${SITE_BORDER}`,
                        color: "text.secondary",
                        "&:hover": { color: "primary.main", borderColor: "primary.main" },
                      }}
                    >
                      <Icon fontSize="small" />
                    </IconButton>
                  );
                })}
              </Stack>
            )}
          </Stack>

          <Stack spacing={1}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: "text.secondary" }}>
              {t("footer.contacts")}
            </Typography>
            {org.branches.map((branch) => (
              <Stack key={branch.id} spacing={0.25}>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <PlaceOutlined sx={{ fontSize: 16, color: "text.secondary", mt: "3px" }} />
                  <Typography sx={{ fontSize: 14 }}>{branch.address}</Typography>
                </Stack>
                {branch.phones.filter(Boolean).map((phone) => (
                  <Link
                    key={phone}
                    href={telHref(phone)}
                    underline="hover"
                    sx={{ fontSize: 14, color: "text.primary", pl: 3 }}
                  >
                    {formatPhone(phone)}
                  </Link>
                ))}
              </Stack>
            ))}
          </Stack>

          <Stack spacing={1}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: "text.secondary" }}>
              {t("footer.links")}
            </Typography>
            {sections.map((section) => (
              <Link
                key={section.id}
                href={`#${section.id}`}
                underline="hover"
                sx={{ fontSize: 14, color: "text.primary" }}
              >
                {section.label}
              </Link>
            ))}
            <Link
              href={bookHref}
              underline="hover"
              sx={{ fontSize: 14, fontWeight: 600, color: "primary.main" }}
            >
              <Stack direction="row" spacing={0.5} alignItems="center">
                <CalendarMonthOutlined sx={{ fontSize: 16 }} />
                <span>{t("footer.bookLink")}</span>
              </Stack>
            </Link>
          </Stack>
        </Box>

        <Divider sx={{ my: 3, borderColor: SITE_BORDER }} />
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
          © {new Date().getFullYear()} {org.organization?.name ?? ""}. {t("footer.rights")}
        </Typography>
      </SiteContainer>
    </Box>
  );
};

// ── Оболочка ─────────────────────────────────────────────────────────────────

/**
 * Внутренняя часть оболочки: здесь уже доступен `useT` с вертикалью
 * организации, поэтому все тексты знают, «врачи» это или «мастера».
 */
const SiteShellInner: React.FC<
  React.PropsWithChildren<{
    org: BookingOrg;
    config: LandingConfig;
    sections: SiteNavItem[];
  }>
> = ({ org, config, sections, children }) => {
  const { t } = useT("landing");
  const brand = useBookingBrand(org.organization);
  const bookHref = bookPath("/book", org.organization?.slug ?? "");

  const title = org.organization
    ? `${org.organization.name} — ${t("brandTitle")}`
    : t("brandTitle");
  usePageMeta(org.organization ? title : null, config.tagline || t("metaDescription"), brand.logoUrl);
  useFavicon(brand.iconUrl);

  return (
    <Box id="top" sx={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <SiteHeader org={org} sections={sections} bookHref={bookHref} />
      <Box component="main" sx={{ flexGrow: 1 }}>
        {children}
      </Box>
      <SiteFooter org={org} config={config} sections={sections} bookHref={bookHref} />
    </Box>
  );
};

/**
 * Тема и каркас лендинга.
 *
 * Вертикаль здесь уже задана снаружи (`PublicVerticalProvider` в
 * `../public-site/index.tsx`): состав блоков и подписи меню вычисляются до
 * оболочки, и если ставить провайдер здесь, меню осталось бы с терминами
 * клиники, пока сами блоки говорили бы «мастера».
 */
export const SiteShell: React.FC<
  React.PropsWithChildren<{
    org: BookingOrg;
    config: LandingConfig;
    sections: SiteNavItem[];
  }>
> = ({ org, config, sections, children }) => {
  const theme = useSiteTheme(config.accentColor);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      {scrollableDocument}
      <SiteShellInner org={org} config={config} sections={sections}>
        {children}
      </SiteShellInner>
    </ThemeProvider>
  );
};
