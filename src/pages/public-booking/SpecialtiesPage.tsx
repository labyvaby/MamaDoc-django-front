import React from "react";
import { Box, Skeleton, Stack, Typography } from "@mui/material";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import { useNavigate } from "react-router";

import { PublicBookingShell } from "./shell";
import { TILE_RADIUS } from "./theme";
import { specialtyIconUrl } from "./specialtyIcons";
import { useSpecialties, type SpecialtyGroup } from "./useSpecialties";
import { useT } from "../../i18n/VerticalProvider";

/** Рамка и фон плитки специализации — значения эталона. */
const TILE_BORDER = "#E6EAF0";
const ICON_FALLBACK_BG = "#F0F4FF";
const ICON_FALLBACK_FG = "#4A6CF7";

/**
 * Плитка специализации: иконка, название и шеврон. Отдельного мобильного
 * варианта в эталоне нет — на всех ширинах одна и та же строка, меняется только
 * число колонок.
 */
export const SpecialtyTile: React.FC<{
  group: SpecialtyGroup;
  active?: boolean;
  onClick: () => void;
}> = ({ group, active, onClick }) => {
  const iconUrl = specialtyIconUrl(group.title);

  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      title={group.title}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        width: "100%",
        p: 2,
        textAlign: "left",
        cursor: "pointer",
        fontFamily: "inherit",
        // Явный цвет: у `button` он берётся из системного `buttontext`, а в
        // теме витрины это белый — текст плитки иначе исчезает на белом фоне.
        color: "text.primary",
        overflow: "hidden",
        border: 1,
        borderRadius: TILE_RADIUS,
        transition: "background-color .2s, border-color .2s, transform .1s",
        ...(active
          ? { bgcolor: "#EFF6FF", borderColor: "#007BFF" }
          : { bgcolor: "background.paper", borderColor: TILE_BORDER }),
        "&:active": { transform: "scale(0.97)" },
      }}
    >
      {iconUrl ? (
        <Box
          component="img"
          src={iconUrl}
          alt=""
          loading="lazy"
          sx={{ width: 32, height: 32, flexShrink: 0, objectFit: "contain", display: "block" }}
        />
      ) : (
        // Иконки нет — квадрат с первой буквой, как в эталоне: чужую картинку
        // подставлять нельзя, «Флеболог» со значком стоматолога читается ошибкой.
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
            fontWeight: 600,
            ...(active
              ? { bgcolor: "#DBEAFE", color: "#007BFF" }
              : { bgcolor: ICON_FALLBACK_BG, color: ICON_FALLBACK_FG }),
          }}
        >
          {group.title.charAt(0)}
        </Box>
      )}

      <Typography
        sx={{
          flexGrow: 1,
          minWidth: 0,
          fontSize: { xs: 14, md: 16 },
          color: active ? "#007BFF" : "text.primary",
          ...(active ? { fontWeight: 600 } : null),
        }}
      >
        {group.title}
      </Typography>

      <ChevronRightOutlined sx={{ fontSize: 20, flexShrink: 0, color: "text.secondary" }} />
    </Box>
  );
};

const TileSkeleton: React.FC = () => (
  <Skeleton variant="rounded" height={64} sx={{ borderRadius: TILE_RADIUS }} />
);

/**
 * Первый экран витрины: выбор специализации. Ведёт на список врачей с
 * подставленным фильтром (`/book/doctors?specialty=…`).
 */
const SpecialtiesPage: React.FC = () => {
  const { t } = useT("publicBooking");
  const navigate = useNavigate();
  const { specialties, loading } = useSpecialties();

  return (
    <PublicBookingShell heading={t("headingSpecialtiesShort")}>
      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(2, minmax(0, 1fr))",
            lg: "repeat(3, minmax(0, 1fr))",
          },
        }}
      >
        {loading
          ? Array.from({ length: 9 }).map((_, i) => <TileSkeleton key={i} />)
          : specialties.map((group) => (
              <SpecialtyTile
                key={group.key}
                group={group}
                onClick={() =>
                  navigate(`/book/doctors?specialty=${encodeURIComponent(group.key)}`)
                }
              />
            ))}
      </Box>

      {!loading && specialties.length === 0 && (
        <Stack alignItems="center" sx={{ py: 6, textAlign: "center" }}>
          <MedicalServicesOutlined sx={{ fontSize: 44, color: "text.disabled" }} />
          <Typography fontWeight={600} sx={{ mt: 1.5 }}>
            {t("noSpecialistsFound")}
          </Typography>
        </Stack>
      )}
    </PublicBookingShell>
  );
};

export default SpecialtiesPage;
