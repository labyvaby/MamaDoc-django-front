import React from "react";
import { Box, Button, Chip, Skeleton, Stack, Typography, alpha } from "@mui/material";
import ArrowForwardOutlined from "@mui/icons-material/ArrowForwardOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";

import { useT } from "../../../i18n/VerticalProvider";
import { bookPath } from "../../public-booking/orgSlug";
import { formatDayMonth, telHref, todayIso } from "../../public-booking/format";
import { primaryPhone } from "../../public-booking/useBookingOrg";
import type { ProfessionalPreview } from "../../../api/publicBooking";
import { SITE_BORDER, SITE_RADIUS, SITE_TILE_RADIUS } from "../theme";
import { SiteContainer } from "../shell";
import type { LandingData } from "../useLandingData";

/**
 * Первый экран: чем занимается бизнес, кнопка записи и — главное — ближайшее
 * свободное время.
 *
 * Окна берём из списка специалистов: публичный API отдаёт `availability` прямо
 * в превью и сортирует список по загруженности, так что сверху те, к кому
 * реально можно попасть. Обычный лендинг обещает «запишитесь онлайн», а этот
 * сразу показывает, на когда есть место — ради этого и нужен сайт на данных CRM.
 */

/** Сколько ближайших окон показываем в карточке первого экрана. */
const SLOTS_PREVIEW = 3;

interface NearestSlot {
  specialist: ProfessionalPreview;
  date: string;
  time: string;
}

/** Ближайшие окна разных специалистов: один специалист — одна строка. */
function nearestSlots(specialists: ProfessionalPreview[]): NearestSlot[] {
  const out: NearestSlot[] = [];
  for (const specialist of specialists) {
    const day = specialist.availability?.nearestDay;
    const time = day?.times.find(Boolean);
    if (!day || !time) continue;
    out.push({ specialist, date: day.date, time });
    if (out.length === SLOTS_PREVIEW) break;
  }
  return out;
}

const SlotRow: React.FC<{ slot: NearestSlot; today: string; orgSlug: string }> = ({
  slot,
  today,
  orgSlug,
}) => {
  const { t } = useT("landing");
  const href = bookPath(`/book/doctor/${slot.specialist.slug || slot.specialist.id}`, orgSlug);

  return (
    <Stack
      component="a"
      href={href}
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={{
        p: 1.5,
        borderRadius: SITE_TILE_RADIUS,
        border: `1px solid ${SITE_BORDER}`,
        bgcolor: "background.paper",
        textDecoration: "none",
        color: "inherit",
        transition: "border-color .2s, transform .1s",
        "&:hover": { borderColor: "primary.main" },
        "&:active": { transform: "scale(0.99)" },
      }}
    >
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Typography noWrap sx={{ fontSize: 14, fontWeight: 600 }}>
          {slot.specialist.fullName}
        </Typography>
        <Typography noWrap sx={{ fontSize: 13, color: "text.secondary" }}>
          {slot.specialist.specialty}
        </Typography>
      </Box>
      <Stack alignItems="flex-end" sx={{ flexShrink: 0 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 700, color: "primary.main" }}>
          {slot.time}
        </Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          {slot.date === today ? t("hero.today") : formatDayMonth(slot.date)}
        </Typography>
      </Stack>
      <ArrowForwardOutlined sx={{ fontSize: 18, color: "text.secondary", flexShrink: 0 }} />
    </Stack>
  );
};

export const Hero: React.FC<{ data: LandingData; tagline: string }> = ({ data, tagline }) => {
  const { t } = useT("landing");
  const { org, specialists, loaded } = data;
  const phone = primaryPhone(org.branches);
  const bookHref = bookPath("/book", org.organization?.slug ?? "");
  const slots = nearestSlots(specialists);
  const today = todayIso();

  const stats = [
    { key: "specialists", count: org.organization?.professionalsCount ?? 0 },
    { key: "directions", count: org.organization?.specialistsCount ?? 0 },
    { key: "branches", count: org.branches.length },
  ].filter((s) => s.count > 0);

  return (
    <Box
      sx={{
        pt: { xs: 5, md: 9 },
        pb: { xs: 5, md: 9 },
        // Мягкая подложка акцентного цвета вместо фотографии: снимков интерьера
        // в CRM нет, а стоковая картинка на сайте клиники читается как обман.
        background: (theme) =>
          `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.07)} 0%, ${
            theme.palette.background.default
          } 100%)`,
      }}
    >
      <SiteContainer>
        <Box
          sx={{
            display: "grid",
            gap: { xs: 4, md: 6 },
            gridTemplateColumns: { xs: "1fr", md: "1.15fr 0.85fr" },
            alignItems: "center",
          }}
        >
          <Box sx={{ animation: "siteFadeUp .4s ease both" }}>
            <Typography
              component="h1"
              sx={{
                fontSize: { xs: 32, md: 48 },
                fontWeight: 800,
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
              }}
            >
              {org.organization?.name ?? <Skeleton width="70%" />}
            </Typography>
            <Typography
              sx={{
                mt: 2,
                fontSize: { xs: 16, md: 19 },
                lineHeight: 1.5,
                color: "text.secondary",
                maxWidth: 560,
              }}
            >
              {tagline || t("hero.taglineDefault")}
            </Typography>

            {/* На телефоне кнопки идут столбиком во всю ширину: в строке они не
                помещаются и «Позвонить» уезжала на вторую строку впритык к краю.
                Граница — md: в этой теме `sm` начинается с 360, то есть телефон
                попадает в sm (см. APP_BREAKPOINTS в theme.ts). */}
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={1.5}
              sx={{ mt: 3, alignItems: { xs: "stretch", md: "center" } }}
            >
              <Button
                href={bookHref}
                variant="contained"
                size="large"
                disableElevation
                endIcon={<ArrowForwardOutlined />}
                sx={{ borderRadius: 99, px: 3, fontWeight: 700 }}
              >
                {t("hero.cta")}
              </Button>
              {phone && (
                <Button
                  href={telHref(phone)}
                  variant="outlined"
                  size="large"
                  startIcon={<PhoneOutlined />}
                  sx={{
                    borderRadius: 99,
                    px: 3,
                    fontWeight: 600,
                    borderColor: SITE_BORDER,
                    color: "text.primary",
                  }}
                >
                  {t("hero.call")}
                </Button>
              )}
            </Stack>

            {stats.length > 0 && (
              <Stack direction="row" spacing={1} sx={{ mt: 3, flexWrap: "wrap", rowGap: 1 }}>
                {stats.map((stat) => (
                  <Chip
                    key={stat.key}
                    label={t(
                      `hero.stat${stat.key.charAt(0).toUpperCase()}${stat.key.slice(1)}`,
                      { count: stat.count },
                    )}
                    sx={{
                      bgcolor: "background.paper",
                      border: `1px solid ${SITE_BORDER}`,
                      fontWeight: 600,
                    }}
                  />
                ))}
              </Stack>
            )}
          </Box>

          {/* Карточка ближайших окон. Пока данные едут — скелетон; если окон нет
              совсем, карточку не рисуем: пустая рамка обещает больше, чем есть. */}
          {(!loaded || slots.length > 0) && (
            <Box
              sx={{
                p: { xs: 2, md: 2.5 },
                borderRadius: SITE_RADIUS,
                border: `1px solid ${SITE_BORDER}`,
                bgcolor: "background.paper",
                animation: "siteFadeUp .5s ease both",
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                <EventAvailableOutlined sx={{ fontSize: 20, color: "primary.main" }} />
                <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
                  {t("hero.nearestSlots")}
                </Typography>
              </Stack>
              <Stack spacing={1}>
                {loaded ? (
                  slots.map((slot) => (
                    <SlotRow
                      key={slot.specialist.id}
                      slot={slot}
                      today={today}
                      orgSlug={org.organization?.slug ?? ""}
                    />
                  ))
                ) : (
                  Array.from({ length: SLOTS_PREVIEW }).map((_, i) => (
                    <Skeleton key={i} variant="rounded" height={64} />
                  ))
                )}
              </Stack>
            </Box>
          )}
        </Box>
      </SiteContainer>
    </Box>
  );
};
