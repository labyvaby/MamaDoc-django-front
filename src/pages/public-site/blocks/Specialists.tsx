import React from "react";
import { Box, Button, Chip, Skeleton, Stack, Typography, alpha } from "@mui/material";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";

import type { ProfessionalPreview } from "../../../api/publicBooking";
import { useT } from "../../../i18n/VerticalProvider";
import { bookPath } from "../../public-booking/orgSlug";
import { SITE_BORDER, SITE_TILE_RADIUS } from "../theme";
import { SiteSection } from "../shell";
import { SPECIALISTS_PREVIEW } from "../useLandingData";
import { EmptyNote } from "./EmptyNote";

/**
 * Команда: фото, специализация, стаж и свободные окна на сегодня.
 *
 * Карточка ведёт прямо на страницу записи к этому специалисту — в этом и разница
 * с обычным сайтом, где «наши специалисты» это галерея без действия.
 */
const SpecialistCard: React.FC<{ specialist: ProfessionalPreview; orgSlug: string }> = ({
  specialist,
  orgSlug,
}) => {
  const { t } = useT("landing");
  const [photoBroken, setPhotoBroken] = React.useState(false);
  const showPhoto = Boolean(specialist.photoUrl) && !photoBroken;
  const href = bookPath(`/book/doctor/${specialist.slug || specialist.id}`, orgSlug);
  const todayFree = specialist.availability?.todayFreeSlots ?? 0;

  return (
    <Stack
      component="a"
      href={href}
      spacing={1.5}
      sx={{
        p: 2,
        height: "100%",
        borderRadius: SITE_TILE_RADIUS,
        border: `1px solid ${SITE_BORDER}`,
        bgcolor: "background.paper",
        textDecoration: "none",
        color: "inherit",
        transition: "border-color .2s",
        "&:hover": { borderColor: "primary.main" },
      }}
    >
      <Box
        sx={{
          width: "100%",
          aspectRatio: "1 / 1",
          borderRadius: SITE_TILE_RADIUS,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
        }}
      >
        {showPhoto ? (
          <Box
            component="img"
            src={specialist.photoUrl ?? undefined}
            alt={specialist.fullName}
            loading="lazy"
            onError={() => setPhotoBroken(true)}
            sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <PersonOutlineOutlined sx={{ fontSize: 44, color: "primary.main", opacity: 0.5 }} />
        )}
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>
          {specialist.fullName}
        </Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.25 }}>
          {specialist.specialty}
        </Typography>
        {specialist.experienceYears > 0 && (
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            {t("specialists.experience", { count: specialist.experienceYears })}
          </Typography>
        )}
      </Box>

      {todayFree > 0 && (
        <Chip
          size="small"
          label={t("specialists.freeToday", { count: todayFree })}
          sx={{
            alignSelf: "flex-start",
            fontWeight: 600,
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
            color: "primary.main",
          }}
        />
      )}
    </Stack>
  );
};

export const Specialists: React.FC<{
  id: string;
  specialists: ProfessionalPreview[];
  loading: boolean;
  orgSlug: string;
  tinted?: boolean;
}> = ({ id, specialists, loading, orgSlug, tinted }) => {
  const { t } = useT("landing");
  // Порядок уже осмысленный: бэк сортирует список по свободным окнам.
  const shown = specialists.slice(0, SPECIALISTS_PREVIEW);

  return (
    <SiteSection
      id={id}
      title={t("specialists.title")}
      subtitle={t("specialists.subtitle")}
      tinted={tinted}
      action={
        specialists.length > shown.length ? (
          <Button
            href={bookPath("/book/doctors", orgSlug)}
            variant="outlined"
            sx={{ borderRadius: 99, borderColor: SITE_BORDER, color: "text.primary", fontWeight: 600 }}
          >
            {t("specialists.all")}
          </Button>
        ) : undefined
      }
    >
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: {
            xs: "repeat(2, minmax(0, 1fr))",
            md: "repeat(3, minmax(0, 1fr))",
            lg: "repeat(4, minmax(0, 1fr))",
          },
        }}
      >
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={260} />
            ))
          : shown.map((specialist) => (
              <SpecialistCard key={specialist.id} specialist={specialist} orgSlug={orgSlug} />
            ))}
      </Box>
      {!loading && shown.length === 0 && <EmptyNote text={t("specialists.empty")} />}
    </SiteSection>
  );
};
