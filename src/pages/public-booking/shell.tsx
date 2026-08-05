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
import { useNavigate } from "react-router";

import { useBookingTheme, BOOKING_PRIMARY, BORDER, MUTED } from "./theme";
import { primaryPhone, useBookingOrg } from "./useBookingOrg";
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
 * ⚠ ТРЕБУЕТ ДЕПЛОЯ БЭКА. На 05.08.2026 ни prod, ни test пустой список не
 * принимали: `400 validation_error`, `details.missing: ["service_ids"]` — гость,
 * не выбравший услугу, упрётся в ошибку на самом сабмите, уже введя имя и
 * телефон. Тикет — `MamaDoc/backend_ticket_booking_deploy_gap_2026-08-05.md` §1.
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

/**
 * Заголовок вкладки и og-теги витрины. Ссылку на запись присылают в мессенджере,
 * поэтому дефолтный титул CRM («Aximo») здесь не годится: гость должен видеть
 * клинику и врача. Титул CRM восстанавливаем при уходе со страницы.
 */
function usePageMeta(title: string | null, description: string) {
  React.useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title;
    upsertMeta("name", "description", description);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:type", "website");
    return () => {
      document.title = previous;
    };
  }, [title, description]);
}

// ── Шапка ────────────────────────────────────────────────────────────────────

/** Логотип клиники; без картинки — монограмма и название текстом. */
const Brand: React.FC = () => {
  const navigate = useNavigate();
  const { organization } = useBookingOrg();
  const [logoBroken, setLogoBroken] = React.useState(false);
  const showLogo = Boolean(organization?.logoUrl) && !logoBroken;

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      onClick={() => navigate("/book")}
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
              bgcolor: "#F0F4FF",
              color: "#4A6CF7",
            }}
          >
            {organization ? (
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
  const navigate = useNavigate();
  const { session, selectedPatient, selectPatient, signOut } = usePatientSession();
  const [authOpen, setAuthOpen] = React.useState(false);
  const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);

  if (BOOKING_AUTH_ENABLED) {
    return (
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexShrink: 0 }}>
        {session ? (
          <>
            <Stack
              direction="row"
              alignItems="center"
              spacing={0.75}
              onClick={() => navigate("/book/me")}
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
                  navigate("/book/me");
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

  if (!phone) return null;
  return (
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
  const navigate = useNavigate();
  return (
    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ py: 1.5 }}>
      {backTo && (
        <IconButton
          size="small"
          onClick={() => navigate(backTo)}
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

  const head = pageTitle || t("brandTitle");
  usePageMeta(organization ? `${head} — ${organization.name}` : head, t("metaDescription"));

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
