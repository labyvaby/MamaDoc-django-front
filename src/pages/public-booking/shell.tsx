import React from "react";
import {
  Badge,
  Box,
  Button,
  Container,
  CssBaseline,
  GlobalStyles,
  IconButton,
  Link as MuiLink,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { ThemeProvider, alpha } from "@mui/material/styles";
import ArrowBackIosNewOutlined from "@mui/icons-material/ArrowBackIosNewOutlined";
import LocalHospitalOutlined from "@mui/icons-material/LocalHospitalOutlined";
import NotificationsNoneOutlined from "@mui/icons-material/NotificationsNoneOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import { useNavigate } from "react-router";

import { useBookingTheme, BOOKING_RADIUS } from "./theme";
import { primaryPhone, useBookingOrg } from "./useBookingOrg";
import { formatPhone, monogram, telHref } from "./format";
import { useT } from "../../i18n/VerticalProvider";

/**
 * Личный кабинет гостя (вход, регистрация, уведомления, «Мои записи»).
 *
 * В макете шапка содержит «Войти / Регистрация», колокольчик и аватар, но за
 * ними нет ни экранов, ни эндпоинтов: авторизации гостя в публичном API нет.
 * Разметка готова и включается этим флагом, когда появится история записей, —
 * до тех пор в шапке стоит рабочая кнопка звонка, а не мёртвые ссылки.
 */
export const BOOKING_AUTH_ENABLED = false;

/**
 * Поля страницы. Макет свёрстан на 1440 с отступами 80 — контент 1280.
 * Container с maxWidth="xl" даёт ровно это на широком экране и сжимается сам
 * на узких, поэтому фиксируем не ширину контента, а поля.
 */
export const PAGE_GUTTER = { xs: 2, sm: 3, md: 6, lg: 10 };

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
      // Появление карточек и шагов. Держим анимацию здесь, а не в каждом
      // компоненте: keyframes нужны обеим страницам витрины.
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
      spacing={1.25}
      onClick={() => navigate("/book")}
      sx={{ cursor: "pointer", minWidth: 0 }}
    >
      {showLogo ? (
        // Логотип клиники обычно уже содержит её название — тогда дублировать
        // его текстом не нужно, в макете шапка тоже состоит из одной картинки.
        <Box
          component="img"
          src={organization?.logoUrl ?? undefined}
          alt={organization?.name ?? ""}
          onError={() => setLogoBroken(true)}
          sx={{ height: 30, maxWidth: 160, objectFit: "contain", display: "block" }}
        />
      ) : (
        <>
          <Box
            sx={{
              width: 34,
              height: 34,
              flexShrink: 0,
              borderRadius: BOOKING_RADIUS,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: 1,
              borderColor: (t) => alpha(t.palette.primary.main, 0.25),
              bgcolor: (t) => t.palette.primary.lighter,
              color: "primary.onSurface",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {organization ? (
              monogram(organization.name)
            ) : (
              <LocalHospitalOutlined fontSize="small" />
            )}
          </Box>
          {/* Пока имя клиники не пришло — скелетон, а не фолбэк: иначе
              название на секунду «мигает» с «Онлайн-запись» на настоящее. */}
          {organization ? (
            <Typography
              noWrap
              sx={{ fontSize: { xs: 15, sm: 16 }, fontWeight: 600, letterSpacing: "-0.01em" }}
            >
              {organization.name}
            </Typography>
          ) : (
            <Skeleton width={130} height={20} />
          )}
        </>
      )}
    </Stack>
  );
};

/** Правая часть шапки: личный кабинет гостя либо телефон клиники. */
const HeaderActions: React.FC = () => {
  const { t } = useT("publicBooking");
  const { branches } = useBookingOrg();
  const phone = primaryPhone(branches);

  if (BOOKING_AUTH_ENABLED) {
    return (
      <Stack direction="row" alignItems="center" spacing={2} sx={{ flexShrink: 0 }}>
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ fontSize: 14 }}>
          <MuiLink component="button" underline="hover" color="text.primary" sx={{ fontSize: 14 }}>
            {t("signIn")}
          </MuiLink>
          <Box component="span" sx={{ color: "text.secondary" }}>
            /
          </Box>
          <MuiLink component="button" underline="hover" color="text.primary" sx={{ fontSize: 14 }}>
            {t("signUp")}
          </MuiLink>
        </Stack>
        <IconButton size="small" sx={{ color: "text.primary" }}>
          <Badge color="error" variant="dot" invisible>
            <NotificationsNoneOutlined sx={{ fontSize: 24 }} />
          </Badge>
        </IconButton>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: (tt) => alpha(tt.palette.text.primary, 0.08),
            color: "text.secondary",
          }}
        >
          <PersonOutlineOutlined fontSize="small" />
        </Box>
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
      position: "sticky",
      top: 0,
      zIndex: (t) => t.zIndex.appBar,
      bgcolor: "background.paper",
    }}
  >
    <Container maxWidth="xl" sx={{ px: PAGE_GUTTER }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1.5}
        sx={{ minHeight: 60 }}
      >
        <Brand />
        <HeaderActions />
      </Stack>
    </Container>
  </Box>
);

/**
 * Подпись экрана под шапкой («Выберите врача, чтобы посмотреть свободные окна»).
 * На мобильных к ней добавляется стрелка возврата — в макете это единственный
 * способ вернуться на шаг назад, отдельной навигации там нет.
 */
const PageHeading: React.FC<{ heading: React.ReactNode; backTo?: string }> = ({
  heading,
  backTo,
}) => {
  const navigate = useNavigate();
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ pt: { xs: 1.5, md: 3 } }}>
      {backTo && (
        <IconButton
          size="small"
          onClick={() => navigate(backTo)}
          sx={{ ml: -0.5, color: "text.primary", display: { md: "none" } }}
          aria-label="Назад"
        >
          <ArrowBackIosNewOutlined sx={{ fontSize: 18 }} />
        </IconButton>
      )}
      <Typography
        component="h1"
        sx={{
          fontSize: { xs: 17, md: 14 },
          fontWeight: { xs: 600, md: 500 },
          lineHeight: 1.35,
          color: "text.primary",
        }}
      >
        {heading}
      </Typography>
    </Stack>
  );
};

// ── Подвал ───────────────────────────────────────────────────────────────────

/**
 * Адреса и телефоны филиалов. В макете подвала нет (кадры обрезаны по 1024),
 * но гостю он нужен: без него адрес клиники на витрине взять негде.
 */
const Footer: React.FC = () => {
  const { organization, branches } = useBookingOrg();
  const headerPhone = primaryPhone(branches);
  if (!organization && branches.length === 0) return null;

  return (
    <Box component="footer" sx={{ mt: "auto", bgcolor: "background.paper" }}>
      <Container maxWidth="xl" sx={{ px: PAGE_GUTTER, py: 2.5 }}>
        <Stack spacing={1}>
          {organization && (
            <Typography variant="body2" fontWeight={600}>
              {organization.name}
            </Typography>
          )}
          {branches.map((branch) => {
            // Телефон шапки в подвале не повторяем — он и так на виду в каждом
            // экране. Показываем только номера филиалов, которые от него
            // отличаются: иначе один и тот же номер встречался трижды.
            const phones = (branch.phones ?? []).filter((phone) => phone !== headerPhone);
            return (
              <Stack
                key={branch.id}
                direction="row"
                spacing={1}
                alignItems="flex-start"
                sx={{ color: "text.secondary" }}
              >
                <PlaceOutlined fontSize="small" sx={{ mt: "1px" }} />
                <Typography variant="body2">
                  {branch.name}
                  {branch.address ? ` — ${branch.address}` : ""}
                  {phones.map((phone) => (
                    <React.Fragment key={phone}>
                      {", "}
                      <MuiLink href={telHref(phone)} underline="hover" color="inherit">
                        {formatPhone(phone)}
                      </MuiLink>
                    </React.Fragment>
                  ))}
                </Typography>
              </Stack>
            );
          })}
        </Stack>
      </Container>
    </Box>
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
 * под шапкой, `backTo` — куда ведёт мобильная стрелка возврата.
 */
export const PublicBookingShell: React.FC<
  React.PropsWithChildren<{
    pageTitle?: string;
    heading?: React.ReactNode;
    backTo?: string;
    /** Липкая панель действия внизу экрана (мобильный футер записи). */
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
          maxWidth="xl"
          sx={{
            px: PAGE_GUTTER,
            pb: { xs: 3, md: 4 },
            flexGrow: 1,
            // Место под липкую панель, иначе она перекрывает последнюю карточку.
            ...(stickyBar ? { pb: { xs: 15, md: 4 } } : null),
          }}
        >
          {heading && <PageHeading heading={heading} backTo={backTo} />}
          <Box sx={{ mt: { xs: 1.5, md: 2 } }}>{children}</Box>
        </Container>
        {stickyBar}
        <Footer />
      </Box>
    </ThemeProvider>
  );
};
