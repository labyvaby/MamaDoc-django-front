import React from "react";
import { Box, Button, Skeleton, Stack, Typography } from "@mui/material";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";

import type { PublicService } from "../../../api/publicBooking";
import { useT } from "../../../i18n/VerticalProvider";
import { bookPath } from "../../public-booking/orgSlug";
import { formatDuration, formatPrice } from "../../public-booking/format";
import { SITE_BORDER, SITE_TILE_RADIUS } from "../theme";
import { SiteSection } from "../shell";
import { SERVICES_PREVIEW } from "../useLandingData";
import { EmptyNote } from "./EmptyNote";

/**
 * Услуги и цены — прайс из CRM, а не отдельно поддерживаемая таблица на сайте.
 * Это главный смысл лендинга на данных CRM: цену поменяли в прайсе — она
 * поменялась на сайте, и «на сайте одна цена, в регистратуре другая» больше не
 * случается.
 *
 * Показываем срез, а не весь каталог: полный список с выбором — в воронке
 * записи, куда ведёт кнопка.
 */
const ServiceCard: React.FC<{ service: PublicService }> = ({ service }) => (
  <Box
    sx={{
      p: 2.5,
      height: "100%",
      display: "flex",
      flexDirection: "column",
      borderRadius: SITE_TILE_RADIUS,
      border: `1px solid ${SITE_BORDER}`,
      bgcolor: "background.paper",
    }}
  >
    <Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{service.name}</Typography>
    {service.description && (
      <Typography
        sx={{
          mt: 1,
          fontSize: 14,
          color: "text.secondary",
          // Описания в прайсе бывают на абзац — карточки не должны разъезжаться.
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {service.description}
      </Typography>
    )}
    <Box sx={{ flexGrow: 1, minHeight: 12 }} />
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
      <Typography sx={{ fontSize: 18, fontWeight: 700 }}>
        {formatPrice(service.basePrice)}
      </Typography>
      {service.durationMinutes > 0 && (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <ScheduleOutlined sx={{ fontSize: 16, color: "text.secondary" }} />
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            {formatDuration(service.durationMinutes)}
          </Typography>
        </Stack>
      )}
    </Stack>
  </Box>
);

export const Services: React.FC<{
  id: string;
  services: PublicService[];
  loading: boolean;
  orgSlug: string;
  tinted?: boolean;
}> = ({ id, services, loading, orgSlug, tinted }) => {
  const { t } = useT("landing");
  // Порядок задаёт CRM (`sortOrder`), иначе прайс на сайте выглядел бы случайным.
  const shown = [...services]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru"))
    .slice(0, SERVICES_PREVIEW);

  return (
    <SiteSection
      id={id}
      title={t("services.title")}
      subtitle={t("services.subtitle")}
      tinted={tinted}
      action={
        services.length > 0 ? (
          <Button
            href={bookPath("/book", orgSlug)}
            variant="outlined"
            sx={{ borderRadius: 99, borderColor: SITE_BORDER, color: "text.primary", fontWeight: 600 }}
          >
            {t("services.all")}
          </Button>
        ) : undefined
      }
    >
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(2, minmax(0, 1fr))",
            lg: "repeat(3, minmax(0, 1fr))",
          },
        }}
      >
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={150} />
            ))
          : shown.map((service) => <ServiceCard key={service.id} service={service} />)}
      </Box>
      {!loading && shown.length === 0 && <EmptyNote text={t("services.empty")} />}
    </SiteSection>
  );
};
