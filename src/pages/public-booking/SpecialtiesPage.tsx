import React from "react";
import { Box, Button, Paper, Skeleton, Stack, Typography } from "@mui/material";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import { useNavigate } from "react-router";

import { PublicBookingShell } from "./shell";
import { BOOKING_RADIUS, PANEL_RADIUS, BOOKING_SHADOW, CARD_BORDER, neutralTone } from "./theme";
import { specialtyIconUrl } from "./specialtyIcons";
import { useSpecialties, type SpecialtyGroup } from "./useSpecialties";
import { useT } from "../../i18n/VerticalProvider";

/**
 * Иконка специализации. Для незнакомого названия картинки нет — тогда ставим
 * нейтральный значок, а не чужой рисунок: «Флеболог» с иконкой стоматолога
 * читается как ошибка данных.
 */
const SpecialtyIcon: React.FC<{ title: string }> = ({ title }) => {
  const url = specialtyIconUrl(title);
  return (
    <Box
      sx={{
        width: 32,
        height: 32,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: (t) => neutralTone(t).fg,
      }}
    >
      {url ? (
        <Box
          component="img"
          src={url}
          alt=""
          loading="lazy"
          sx={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
      ) : (
        <MedicalServicesOutlined sx={{ fontSize: 26 }} />
      )}
    </Box>
  );
};

/**
 * Плитка специализации. На десктопе это строка внутри общей карточки, на
 * мобильном — отдельная карточка со стрелкой: в макете экраны различаются
 * именно этим.
 */
const SpecialtyTile: React.FC<{ group: SpecialtyGroup; index: number; onClick: () => void }> = ({
  group,
  index,
  onClick,
}) => (
  <Box
    component="button"
    type="button"
    onClick={onClick}
    sx={{
      display: "flex",
      alignItems: "center",
      gap: { xs: 2, md: 3.25 },
      width: "100%",
      px: 2,
      py: { xs: 1.5, md: 1.25 },
      textAlign: "left",
      cursor: "pointer",
      fontFamily: "inherit",
      border: 1,
      borderColor: CARD_BORDER,
      borderRadius: BOOKING_RADIUS,
      bgcolor: "background.paper",
      transition: "border-color .2s, background-color .2s",
      animation: "bookingFadeUp .32s ease both",
      animationDelay: `${Math.min(index, 12) * 25}ms`,
      "@media (prefers-reduced-motion: reduce)": { animation: "none" },
      "&:hover": { borderColor: "primary.main" },
      "&:active": { transform: "scale(0.995)" },
    }}
  >
    <SpecialtyIcon title={group.title} />
    <Typography sx={{ flexGrow: 1, minWidth: 0, fontSize: 16, color: "text.primary" }}>
      {group.title}
    </Typography>
    {/* Стрелка — только в мобильном макете: на десктопе строки лежат в сетке,
        и три колонки шевронов превращают экран в частокол. */}
    <ChevronRightOutlined
      sx={{ display: { md: "none" }, fontSize: 20, color: "text.secondary", flexShrink: 0 }}
    />
  </Box>
);

const TileSkeleton: React.FC = () => (
  <Skeleton variant="rounded" height={52} sx={{ borderRadius: BOOKING_RADIUS }} />
);

/**
 * Первый экран витрины: выбор специализации. Ведёт на список врачей с
 * подставленным фильтром (`/book/doctors?specialty=…`).
 */
const SpecialtiesPage: React.FC = () => {
  const { t } = useT("publicBooking");
  const navigate = useNavigate();
  const { specialties, loading } = useSpecialties();

  const openDoctors = (group?: SpecialtyGroup) =>
    navigate(group ? `/book/doctors?specialty=${encodeURIComponent(group.key)}` : "/book/doctors");

  return (
    <PublicBookingShell
      heading={
        <>
          <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>
            {t("headingSpecialties")}
          </Box>
          <Box component="span" sx={{ display: { xs: "inline", md: "none" } }}>
            {t("headingSpecialtiesShort")}
          </Box>
        </>
      }
    >
      {/* Карточка-контейнер есть только на десктопе: в мобильном макете плитки
          лежат прямо на фоне страницы. */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 0, md: 2.5 },
          borderRadius: PANEL_RADIUS,
          bgcolor: { xs: "transparent", md: "background.paper" },
          boxShadow: { xs: "none", md: BOOKING_SHADOW },
          border: "none",
        }}
      >
        <Box
          sx={{
            display: "grid",
            gap: { xs: 1.25, md: 2.5 },
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, minmax(0, 1fr))",
              lg: "repeat(3, minmax(0, 1fr))",
            },
          }}
        >
          {loading
            ? Array.from({ length: 9 }).map((_, i) => <TileSkeleton key={i} />)
            : specialties.map((group, index) => (
                <SpecialtyTile
                  key={group.key}
                  group={group}
                  index={index}
                  onClick={() => openDoctors(group)}
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
      </Paper>

      {/* Выхода «мимо специализации» в макете нет, но без него гость обязан
          выбрать направление, даже когда ищет конкретного врача по фамилии. */}
      <Stack alignItems="center" sx={{ mt: { xs: 2, md: 3 } }}>
        <Button onClick={() => openDoctors()} sx={{ fontWeight: 600 }}>
          {t("allSpecialties")}
        </Button>
      </Stack>
    </PublicBookingShell>
  );
};

export default SpecialtiesPage;
