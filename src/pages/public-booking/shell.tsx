import React from "react";
import {
  Box,
  Button,
  Container,
  CssBaseline,
  GlobalStyles,
  IconButton,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import ArrowBackIosNewOutlined from "@mui/icons-material/ArrowBackIosNewOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import LocalHospitalOutlined from "@mui/icons-material/LocalHospitalOutlined";
import LogoutOutlined from "@mui/icons-material/LogoutOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import { useBookingTheme, BOOKING_PRIMARY, BORDER, MUTED } from "./theme";
import { primaryPhone, useBookingOrg } from "./useBookingOrg";
import { bookPath, useBookingNav, useBookingOrgSlug } from "./orgSlug";
import { InstallAppButton, useAppManifest } from "../../pwa";
import { BOOKING_ORG_SLUG, type OrganizationDetail } from "../../api/publicBooking";
import { formatPhone, monogram, telHref } from "./format";
import { usePatientSession } from "./PatientSession";
import { PatientAuthDialog } from "./booking/PatientAuthDialog";
import { useT } from "../../i18n/VerticalProvider";

/**
 * Личный кабинет пациента: вход по SMS, «Мои записи», выбор карты.
 *
 * Бэк реализовал контур (`/api/v1/auth/*`, `/api/v1/me*`, токен в
 * `X-Patient-Token`) — проверено живым входом на тесте 05.08.2026. Уведомлений
 * в первом релизе нет: пушей/подписок бэк не отдаёт, колокольчик из эталона
 * рисовать нечем.
 *
 * ⚠ Требует задеплоенного booking-контура: на окружении без него ручки отвечают
 * 404, и вход просто не сработает (см. тикет
 * `MamaDoc/backend_ticket_booking_deploy_gap_2026-08-05.md`).
 */
export const BOOKING_AUTH_ENABLED = true;

/**
 * Запись «просто к врачу», без выбора услуги (бэклог заказчика 04.08.2026).
 * Работаем по контракту из `BOOKING_AND_TEST_ENVIRONMENT.md` (05.08.2026):
 * бэк принимает пустой `service_ids` и резервирует окно 30 минут, а услуги
 * персонал выбирает при подтверждении в CRM (`PATCH /api/bookings/<id>/status/`
 * с `serviceIds` — эта часть уже работает).
 *
 * ⚠ ТРЕБУЕТ ДЕПЛОЯ ПРОДА. На тесте фича проверена целиком (06.08.2026: запись
 * без услуги → `201`, бронь `services: []`, `totalPrice: "0.00"`,
 * `totalDurationMin: 30`, в кабинете «Услуги подберём на приёме»), а на
 * newcrm.pediatr.kg `service_ids` остаётся в `missing`: гость, не выбравший
 * услугу, упрётся в 400 на самом сабмите, уже введя имя и телефон. Тикет —
 * `MamaDoc/backend_ticket_booking_deploy_gap_2026-08-05.md` §1.
 */
export const BOOKING_NO_SERVICE_ENABLED = true;

/**
 * Поля страницы. Эталон держит контент в контейнере 1280 с отступом 16
 * (`max-w-7xl mx-auto px-4`) — повторяем.
 */
export const PAGE_GUTTER = 2;

/**
 * Возврат прокрутки документа. CRM в `App.tsx` держит `html/body/#root` в
 * `height: 100%; overflow: hidden` — внутри staff-layout скроллится собственный
 * контейнер. Витрина рендерится вне layout, поэтому там страница не скроллилась
 * вообще: всё ниже первого экрана было недостижимо. Правило снимается вместе с
 * размонтированием витрины, стили CRM не затронуты.
 */
const scrollableDocument = (
  <GlobalStyles
    styles={{
      html: { height: "auto", overflow: "visible" },
      body: { height: "auto", minHeight: "100%", overflow: "visible" },
      "#root": { height: "auto", minHeight: "100%", overflow: "visible" },
      // Появление блоков записи. Keyframes нужны обеим страницам витрины.
      "@keyframes bookingFadeUp": {
        from: { opacity: 0, transform: "translateY(8px)" },
        to: { opacity: 1, transform: "none" },
      },
    }}
  />
);

// ── Бренд клиники ────────────────────────────────────────────────────────────

/**
 * Логотип клиники для шапки и превью ссылки, иконка вкладки.
 *
 * Публичный API организации логотип не отдаёт (в ответе прода есть только
 * `name`, `phones`, счётчики), поэтому для организации по умолчанию берём файлы
 * из `public/`. Чужой клинике (`?org=`) фолбэка нет намеренно: показать ей
 * логотип «Мама Доктора» хуже, чем нейтральную монограмму. Как только бэк
 * начнёт отдавать `logoUrl`, ветка с файлами станет ненужной сама собой.
 */
const BOOKING_LOGO_URL = import.meta.env.VITE_BOOKING_LOGO_URL || "/og-image.png";
const BOOKING_ICON_URL = import.meta.env.VITE_BOOKING_ICON_URL || "/booking-icon.png";

interface BookingBrand {
  /** Логотип для шапки; `null` — рисуем монограмму. */
  logoUrl: string | null;
  /** Иконка вкладки; `null` — оставляем иконку CRM. */
  iconUrl: string | null;
}

function useBookingBrand(organization: OrganizationDetail | null): BookingBrand {
  const orgSlug = useBookingOrgSlug();
  const isDefaultOrg = orgSlug === BOOKING_ORG_SLUG;
  return React.useMemo(
    () => ({
      logoUrl: organization?.logoUrl || (isDefaultOrg ? BOOKING_LOGO_URL : null),
      iconUrl: organization?.logoUrl || (isDefaultOrg ? BOOKING_ICON_URL : null),
    }),
    [organization?.logoUrl, isDefaultOrg],
  );
}

// ── Заголовок вкладки и мета-теги ────────────────────────────────────────────

function upsertMeta(attr: "name" | "property", key: string, value: string) {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = value;
}

/** Абсолютный адрес: og:image по относительному пути мессенджеры не тянут. */
function absoluteUrl(path: string): string {
  try {
    return new URL(path, window.location.origin).toString();
  } catch {
    return path;
  }
}

/**
 * Заголовок вкладки и og-теги витрины. Ссылку на запись присылают в мессенджере,
 * поэтому дефолтный титул CRM («Aximo CRM») здесь не годится: гость должен
 * видеть клинику и врача. Значения CRM восстанавливаем при уходе со страницы —
 * иначе после возврата в CRM во вкладке остаётся описание витрины.
 *
 * ⚠ Это работает только для уже открытой вкладки. Краулеры мессенджеров JS не
 * выполняют и читают статические теги из `index.html` (см. комментарий там):
 * превью ссылки одинаково для всех страниц витрины и описывает организацию по
 * умолчанию. Персональное превью врача требует серверного рендеринга.
 */
function usePageMeta(title: string | null, description: string, imageUrl: string | null) {
  React.useEffect(() => {
    if (!title) return;
    const previousTitle = document.title;
    const previousMeta = new Map<HTMLMetaElement, string>();
    const set = (attr: "name" | "property", key: string, value: string) => {
      const el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (el && !previousMeta.has(el)) previousMeta.set(el, el.content);
      upsertMeta(attr, key, value);
    };

    document.title = title;
    set("name", "description", description);
    set("property", "og:type", "website");
    set("property", "og:title", title);
    set("property", "og:description", description);
    set("property", "og:url", window.location.href);
    if (imageUrl) set("property", "og:image", absoluteUrl(imageUrl));

    return () => {
      document.title = previousTitle;
      previousMeta.forEach((value, el) => {
        el.content = value;
      });
    };
  }, [title, description, imageUrl]);
}

/**
 * Иконка вкладки на время показа витрины. Гость видит вкладку клиники, а не
 * логотип CRM. Иконки CRM снимаем и возвращаем целиком: у них разные `type`
 * (ico и svg), подменить один `href` нельзя — браузер отрисует не то.
 */
function useFavicon(href: string | null) {
  React.useEffect(() => {
    if (!href) return;
    const replaced = Array.from(
      document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'),
    );
    replaced.forEach((link) => link.remove());

    const link = document.createElement("link");
    link.rel = "icon";
    link.href = href;
    document.head.appendChild(link);

    return () => {
      link.remove();
      replaced.forEach((prev) => document.head.appendChild(prev));
    };
  }, [href]);
}

// ── Шапка ────────────────────────────────────────────────────────────────────

/** Логотип клиники; без картинки — монограмма и название текстом. */
const Brand: React.FC = () => {
  const { go } = useBookingNav();
  const { organization } = useBookingOrg();
  const brand = useBookingBrand(organization);
  const [logoBroken, setLogoBroken] = React.useState(false);
  const [iconBroken, setIconBroken] = React.useState(false);
  // Логотип из API — готовая шапка клиники, её показываем целиком. Локальный
  // файл — квадратный знак, он идёт значком рядом с названием.
  const showLogo = Boolean(organization?.logoUrl) && !logoBroken;
  const showIcon = Boolean(brand.iconUrl) && !iconBroken;

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      onClick={() => go("/book")}
      sx={{ cursor: "pointer", minWidth: 0 }}
    >
      {showLogo ? (
        <Box
          component="img"
          src={organization?.logoUrl ?? undefined}
          alt={organization?.name ?? ""}
          onError={() => setLogoBroken(true)}
          sx={{ height: 32, maxWidth: 160, objectFit: "contain", display: "block" }}
        />
      ) : (
        <>
          {/* Заглушка эталона: квадрат со значком клиники и название рядом. */}
          <Box
            sx={{
              width: 32,
              height: 32,
              flexShrink: 0,
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              ...(showIcon
                ? null
                : { bgcolor: "#F0F4FF", color: "#4A6CF7" }),
            }}
          >
            {showIcon ? (
              <Box
                component="img"
                src={brand.iconUrl ?? undefined}
                alt={organization?.name ?? ""}
                onError={() => setIconBroken(true)}
                sx={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
              />
            ) : organization ? (
              <Typography sx={{ fontSize: 12, fontWeight: 700 }}>
                {monogram(organization.name)}
              </Typography>
            ) : (
              <LocalHospitalOutlined sx={{ fontSize: 18 }} />
            )}
          </Box>
          {organization ? (
            <Typography
              noWrap
              sx={{ fontSize: 14, fontWeight: 600, color: "#333", maxWidth: 144 }}
            >
              {organization.name}
            </Typography>
          ) : (
            <Skeleton width={120} height={20} />
          )}
        </>
      )}
    </Stack>
  );
};

/** Правая часть шапки: кабинет пациента (если включён) плюс телефон клиники. */
const HeaderActions: React.FC = () => {
  const { t } = useT("publicBooking");
  const { branches } = useBookingOrg();
  const phone = primaryPhone(branches);
  const { go } = useBookingNav();
  const { session, selectedPatient, selectPatient, signOut } = usePatientSession();
  const [authOpen, setAuthOpen] = React.useState(false);
  const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);

  // Иконка витрины на главный экран телефона: пациент возвращается к записи
  // одним касанием, не разыскивая ссылку в переписке. На телефоне подпись
  // прячем — в шапке уже логотип клиники и вход.
  const installButton = (
    <InstallAppButton
      compact
      responsiveLabel
      sx={{
        borderRadius: 99,
        fontWeight: 600,
        borderColor: "divider",
        color: "text.primary",
        "&:hover": { borderColor: BOOKING_PRIMARY, bgcolor: "transparent" },
      }}
    />
  );

  if (BOOKING_AUTH_ENABLED) {
    return (
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexShrink: 0 }}>
        {installButton}
        {session ? (
          <>
            <Stack
              direction="row"
              alignItems="center"
              spacing={0.75}
              onClick={() => go("/book/me")}
              sx={{
                display: { xs: "none", sm: "flex" },
                fontSize: 14,
                fontWeight: 500,
                color: "#333",
                cursor: "pointer",
                transition: "color .2s",
                "&:hover": { color: BOOKING_PRIMARY },
              }}
            >
              <HistoryOutlined sx={{ fontSize: 16 }} />
              {t("auth.myBookings")}
            </Stack>
            <Box
              onClick={(e) => setMenuAnchor(e.currentTarget)}
              sx={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                cursor: "pointer",
                bgcolor: "#F0F4FF",
                border: "1px solid #D0DCFF",
                color: BOOKING_PRIMARY,
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {selectedPatient ? monogram(selectedPatient.fullName) : <PersonOutlineOutlined sx={{ fontSize: 22 }} />}
            </Box>
            <Menu
              anchorEl={menuAnchor}
              open={Boolean(menuAnchor)}
              onClose={() => setMenuAnchor(null)}
              slotProps={{ paper: { sx: { minWidth: 220 } } }}
            >
              {/* Карты одного номера: переключение без повторного SMS. */}
              {session.patients.map((p) => (
                <MenuItem
                  key={p.id}
                  selected={p.id === selectedPatient?.id}
                  onClick={() => {
                    selectPatient(p.id);
                    setMenuAnchor(null);
                  }}
                >
                  <Typography sx={{ fontSize: 14 }}>{p.fullName}</Typography>
                </MenuItem>
              ))}
              <MenuItem
                onClick={() => {
                  setMenuAnchor(null);
                  go("/book/me");
                }}
                sx={{ borderTop: `1px solid ${BORDER}` }}
              >
                <HistoryOutlined sx={{ fontSize: 18, mr: 1, color: MUTED }} />
                <Typography sx={{ fontSize: 14 }}>{t("auth.myBookings")}</Typography>
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setMenuAnchor(null);
                  signOut();
                }}
              >
                <LogoutOutlined sx={{ fontSize: 18, mr: 1, color: MUTED }} />
                <Typography sx={{ fontSize: 14 }}>{t("auth.signOut")}</Typography>
              </MenuItem>
            </Menu>
          </>
        ) : (
          <Button
            onClick={() => setAuthOpen(true)}
            variant="outlined"
            size="small"
            startIcon={<PersonOutlineOutlined />}
            sx={{
              flexShrink: 0,
              borderRadius: 99,
              px: { xs: 1.5, sm: 2 },
              fontWeight: 600,
              whiteSpace: "nowrap",
              borderColor: "divider",
              color: "text.primary",
              "&:hover": { borderColor: BOOKING_PRIMARY, bgcolor: "transparent" },
            }}
          >
            {t("auth.signIn")}
          </Button>
        )}
        <PatientAuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
      </Stack>
    );
  }

  if (!phone) return installButton;
  return (
    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexShrink: 0 }}>
      {installButton}
      <Button
        href={telHref(phone)}
        variant="outlined"
        size="small"
        startIcon={<PhoneOutlined />}
        sx={{
          flexShrink: 0,
          borderRadius: 99,
          px: { xs: 1.5, sm: 2 },
          fontWeight: 600,
          whiteSpace: "nowrap",
          borderColor: "divider",
          color: "text.primary",
          "&:hover": { borderColor: "primary.main", bgcolor: "transparent" },
        }}
      >
        {/* Номер целиком — только там, где он не поджимает название. */}
        <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
          {formatPhone(phone)}
        </Box>
        <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
          {t("callClinic")}
        </Box>
      </Button>
    </Stack>
  );
};

const Header: React.FC = () => (
  <Box
    component="header"
    sx={{
      py: 2,
      // В эталоне шапка белая только с планшета: на телефоне она сливается с фоном.
      bgcolor: { xs: "transparent", md: "background.paper" },
    }}
  >
    <Container maxWidth={false} sx={{ maxWidth: 1280, px: PAGE_GUTTER }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5}>
        <Brand />
        <HeaderActions />
      </Stack>
    </Container>
  </Box>
);

/**
 * Подпись экрана под шапкой со стрелкой возврата — в эталоне она есть на всех
 * ширинах, а не только на телефоне.
 */
const PageHeading: React.FC<{ heading: React.ReactNode; backTo?: string }> = ({
  heading,
  backTo,
}) => {
  const { go } = useBookingNav();
  return (
    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ py: 1.5 }}>
      {backTo && (
        <IconButton
          size="small"
          onClick={() => go(backTo)}
          sx={{ ml: -1, color: MUTED }}
          aria-label="Назад"
        >
          <ArrowBackIosNewOutlined sx={{ fontSize: 16 }} />
        </IconButton>
      )}
      <Typography
        component="h1"
        sx={{ fontSize: 14, fontWeight: 500, lineHeight: 1.4, color: "text.primary" }}
      >
        {heading}
      </Typography>
    </Stack>
  );
};

// ── Оболочка ─────────────────────────────────────────────────────────────────

/**
 * Обёртка публичных страниц записи (`/book/*`). Рендерится вне staff-layout и
 * RequireAuth и подменяет тему CRM на тему витрины (см. `./theme.ts`): гость
 * не должен видеть тёмный интерфейс только потому, что его выбрал сотрудник.
 *
 * `pageTitle` — что стоит в заголовке вкладки перед названием клиники (имя
 * врача на его странице, «Онлайн-запись» на списке). `heading` — подпись экрана
 * под шапкой, `backTo` — куда ведёт стрелка возврата, `stickyBar` — липкая
 * панель действия внизу (мобильный футер записи).
 */
export const PublicBookingShell: React.FC<
  React.PropsWithChildren<{
    pageTitle?: string;
    heading?: React.ReactNode;
    backTo?: string;
    stickyBar?: React.ReactNode;
  }>
> = ({ children, pageTitle, heading, backTo, stickyBar }) => {
  const { t } = useT("publicBooking");
  const theme = useBookingTheme();
  const { organization } = useBookingOrg();
  const brand = useBookingBrand(organization);
  const orgSlug = useBookingOrgSlug();

  // «Иванов Иван — Онлайн-запись — Мама Доктор»: на странице врача без слова
  // «запись» вкладка не объясняет, куда попал гость.
  const title = [pageTitle, t("brandTitle"), organization?.name]
    .filter(Boolean)
    .join(" — ");
  usePageMeta(title, t("metaDescription"), brand.logoUrl);
  useFavicon(brand.iconUrl);

  // Иконка витрины на главном экране телефона: имя и логотип — клиники из
  // адреса, запуск — сразу на её страницу записи (`?org=` внутри `bookPath`).
  // Пока организация грузится, обходимся нейтральным «Онлайн-запись»: браузер
  // проверяет установку почти сразу после загрузки страницы.
  useAppManifest({
    name: organization ? `${t("brandTitle")} — ${organization.name}` : t("brandTitle"),
    shortName: organization?.name || t("brandTitle"),
    startUrl: bookPath("/book", orgSlug),
    iconUrl: brand.iconUrl,
    themeColor: BOOKING_PRIMARY,
    backgroundColor: theme.palette.background.default,
  });

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      {scrollableDocument}
      <Box
        sx={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.default",
        }}
      >
        <Header />
        <Container
          maxWidth={false}
          sx={{
            maxWidth: 1280,
            px: PAGE_GUTTER,
            pb: { xs: 3, md: 4 },
            flexGrow: 1,
            // Место под липкую панель, иначе она перекрывает последний блок.
            ...(stickyBar ? { pb: { xs: 18, lg: 4 } } : null),
          }}
        >
          {heading && <PageHeading heading={heading} backTo={backTo} />}
          {children}
        </Container>
        {stickyBar}
      </Box>
    </ThemeProvider>
  );
};
