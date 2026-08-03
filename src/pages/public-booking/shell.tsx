import React from "react";
import {
  Box,
  Button,
  Container,
  CssBaseline,
  GlobalStyles,
  Link as MuiLink,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { ThemeProvider, alpha } from "@mui/material/styles";
import LocalHospitalOutlined from "@mui/icons-material/LocalHospitalOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import { useNavigate } from "react-router";

import { useBookingTheme, TILE_RADIUS } from "./theme";
import { primaryPhone, useBookingOrg } from "./useBookingOrg";
import { formatPhone, monogram, telHref } from "./format";
import { useT } from "../../i18n/VerticalProvider";

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

// ── Оболочка ─────────────────────────────────────────────────────────────────

const Header: React.FC<{ maxWidth: "sm" | "md" | "lg" }> = ({ maxWidth }) => {
  const { t } = useT("publicBooking");
  const navigate = useNavigate();
  const { organization, branches } = useBookingOrg();
  const phone = primaryPhone(branches);
  const [logoBroken, setLogoBroken] = React.useState(false);
  const showLogo = Boolean(organization?.logoUrl) && !logoBroken;

  return (
    <Box
      component="header"
      sx={{
        position: "sticky",
        top: 0,
        zIndex: (t) => t.zIndex.appBar,
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <Container maxWidth={maxWidth} sx={{ minHeight: 64, display: "flex", alignItems: "center" }}>
        {/* justifyContent, а не ml:auto у кнопки: spacing у Stack задаёт детям
            margin-left селектором с большей специфичностью и гасит его. */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1.5}
          sx={{ width: "100%" }}
        >
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.5}
            onClick={() => navigate("/book")}
            sx={{ cursor: "pointer", minWidth: 0 }}
          >
            {/* Логотип клиники, если бэк его отдаёт; иначе монограмма («МД») —
                она читается как знак клиники, в отличие от дежурной иконки
                больницы. Битую картинку тоже подменяем монограммой. */}
            <Box
              sx={{
                width: 40,
                height: 40,
                flexShrink: 0,
                borderRadius: TILE_RADIUS,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                border: 1,
                borderColor: (t) => alpha(t.palette.primary.main, 0.25),
                bgcolor: (t) => t.palette.primary.lighter,
                color: "primary.onSurface",
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: "0.02em",
              }}
            >
              {showLogo ? (
                <Box
                  component="img"
                  src={organization?.logoUrl ?? undefined}
                  alt={organization?.name ?? ""}
                  onError={() => setLogoBroken(true)}
                  sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              ) : organization ? (
                monogram(organization.name)
              ) : (
                <LocalHospitalOutlined fontSize="small" />
              )}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              {/* Пока имя клиники не пришло — скелетон, а не фолбэк: иначе
                  название на секунду «мигает» с «Онлайн-запись» на настоящее. */}
              {organization ? (
                <Typography
                  noWrap
                  sx={{
                    fontSize: { xs: 16, sm: 17 },
                    fontWeight: 700,
                    lineHeight: 1.2,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {organization.name}
                </Typography>
              ) : (
                <Skeleton width={150} height={20} />
              )}
              <Typography
                noWrap
                sx={{
                  mt: "1px",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "text.secondary",
                }}
              >
                {t("brandSubtitle")}
              </Typography>
            </Box>
          </Stack>

          {phone && (
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
          )}
        </Stack>
      </Container>
    </Box>
  );
};

const Footer: React.FC<{ maxWidth: "sm" | "md" | "lg" }> = ({ maxWidth }) => {
  const { organization, branches } = useBookingOrg();
  const headerPhone = primaryPhone(branches);
  if (!organization && branches.length === 0) return null;

  return (
    <Box
      component="footer"
      sx={{ mt: "auto", borderTop: 1, borderColor: "divider", bgcolor: "background.paper" }}
    >
      <Container maxWidth={maxWidth} sx={{ py: 2.5 }}>
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

/**
 * Обёртка публичных страниц записи (`/book/*`). Рендерится вне staff-layout и
 * RequireAuth и подменяет тему CRM на тему витрины (см. `./theme.ts`): гость
 * не должен видеть тёмный интерфейс только потому, что его выбрал сотрудник.
 *
 * `pageTitle` — что стоит в заголовке вкладки перед названием клиники (имя
 * врача на его странице, «Онлайн-запись» на списке).
 */
export const PublicBookingShell: React.FC<
  React.PropsWithChildren<{ maxWidth?: "sm" | "md" | "lg"; pageTitle?: string }>
> = ({ children, maxWidth = "lg", pageTitle }) => {
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
        <Header maxWidth={maxWidth} />
        <Container maxWidth={maxWidth} sx={{ py: { xs: 2, md: 3 }, flexGrow: 1 }}>
          {children}
        </Container>
        <Footer maxWidth={maxWidth} />
      </Box>
    </ThemeProvider>
  );
};
