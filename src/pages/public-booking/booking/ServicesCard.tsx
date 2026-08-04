import React from "react";
import { Box, ButtonBase, Paper, Skeleton, Stack, Typography } from "@mui/material";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";

import {
  BOOKING_PRIMARY,
  BOOKING_RADIUS,
  BOOKING_SHADOW,
  DISABLED_TEXT,
  DIVIDER,
  FAINT_TEXT,
  MUTED,
  THIN_SCROLLBAR,
  serviceTone,
} from "../theme";
import { formatDuration, formatPrice, formatServicesCount } from "../format";
import { useT } from "../../../i18n/VerticalProvider";

/** Услуга в выборе: и из карточки врача, и из available-services одна форма. */
export interface PickableService {
  id: number;
  name: string;
  description?: string;
  durationMinutes: number;
  basePrice: string;
}

/** После какой длины описание сворачивается под «Подробнее». */
const DESCRIPTION_CLAMP_LENGTH = 70;

const ServiceRow: React.FC<{
  service: PickableService;
  checked: boolean;
  onToggle: () => void;
}> = ({ service, checked, onToggle }) => {
  const { t } = useT("publicBooking");
  const [expanded, setExpanded] = React.useState(false);
  const isLong = (service.description?.length ?? 0) > DESCRIPTION_CLAMP_LENGTH;

  return (
    <Stack
      direction="row"
      alignItems="flex-start"
      spacing={1.5}
      sx={{
        py: 1.75,
        px: 1,
        mx: -0.5,
        borderRadius: "8px",
        transition: "background-color .15s",
        bgcolor: checked ? serviceTone.rowPicked : "transparent",
        "&:hover": checked ? {} : { bgcolor: serviceTone.rowHover },
      }}
    >
      <ButtonBase
        onClick={onToggle}
        sx={{
          display: "flex",
          alignItems: "flex-start",
          gap: 1.5,
          flexGrow: 1,
          minWidth: 0,
          textAlign: "left",
          justifyContent: "flex-start",
        }}
      >
        <Box
          sx={{
            width: 22,
            height: 22,
            flexShrink: 0,
            mt: "1px",
            borderRadius: "6px",
            border: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background-color .15s, border-color .15s",
            borderColor: checked ? serviceTone.checked : serviceTone.checkboxBorder,
            bgcolor: checked ? serviceTone.checked : "#FFFFFF",
            color: "#FFFFFF",
          }}
        >
          {checked && <CheckOutlined sx={{ fontSize: 14 }} />}
        </Box>

        <Stack spacing={0.25} sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography
            sx={{ fontSize: { xs: 13, md: 14 }, fontWeight: 600, lineHeight: 1.35 }}
          >
            {service.name}
          </Typography>
          {service.description && (
            <Typography
              sx={{
                fontSize: { xs: 11, md: 12 },
                color: MUTED,
                lineHeight: 1.35,
                whiteSpace: "pre-line",
                ...(isLong && !expanded
                  ? {
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }
                  : null),
              }}
            >
              {service.description}
            </Typography>
          )}
        </Stack>
      </ButtonBase>

      <Stack alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0, mt: "1px" }}>
        <Typography
          sx={{
            fontSize: { xs: 13, md: 14 },
            fontWeight: 600,
            whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums",
            color: checked ? serviceTone.pricePicked : "text.primary",
          }}
        >
          {formatPrice(service.basePrice)}
        </Typography>
        {service.durationMinutes > 0 && (
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <ScheduleOutlined sx={{ fontSize: 10, color: FAINT_TEXT }} />
            <Typography sx={{ fontSize: 10, fontWeight: 500, color: FAINT_TEXT, whiteSpace: "nowrap" }}>
              {formatDuration(service.durationMinutes)}
            </Typography>
          </Stack>
        )}
        {isLong && (
          <Typography
            component="button"
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            sx={{
              border: 0,
              bgcolor: "transparent",
              cursor: "pointer",
              p: 0,
              fontFamily: "inherit",
              fontSize: 10,
              fontWeight: 600,
              color: BOOKING_PRIMARY,
              whiteSpace: "nowrap",
            }}
          >
            {expanded ? t("collapse") : t("readMore")}
          </Typography>
        )}
      </Stack>
    </Stack>
  );
};

/**
 * Выбор услуг. Появляется после того, как гость первый раз выбрал время, и
 * дальше остаётся на экране — как в эталоне.
 */
export const ServicesCard: React.FC<{
  services: PickableService[];
  selected: number[];
  onToggle: (id: number) => void;
  loading?: boolean;
}> = ({ services, selected, onToggle, loading }) => {
  const { t } = useT("publicBooking");
  const chosen = services.filter((s) => selected.includes(s.id));
  const totalPrice = chosen.reduce((sum, s) => sum + Number(s.basePrice ?? 0), 0);
  const totalDuration = chosen.reduce((sum, s) => sum + s.durationMinutes, 0);

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, md: 2.5 },
        borderRadius: BOOKING_RADIUS,
        border: "none",
        boxShadow: BOOKING_SHADOW,
      }}
    >
      <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{t("chooseServices")}</Typography>
        {!loading && services.length > 0 && (
          <Typography sx={{ fontSize: 11, fontWeight: 500, color: MUTED }}>
            {formatServicesCount(services.length)}
          </Typography>
        )}
      </Stack>

      <Stack
        sx={{
          maxHeight: 320,
          overflowY: "auto",
          pr: 1,
          ...THIN_SCROLLBAR,
          "& > *:not(:first-of-type)": { borderTop: `1px solid ${DIVIDER}` },
        }}
      >
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Stack key={i} direction="row" spacing={1.5} sx={{ py: 1.75 }}>
              <Skeleton variant="rounded" width={22} height={22} />
              <Stack spacing={0.75} sx={{ flexGrow: 1 }}>
                <Skeleton width="60%" height={16} />
                <Skeleton width="40%" height={12} />
              </Stack>
              <Skeleton width={56} height={16} />
            </Stack>
          ))
        ) : services.length === 0 ? (
          <Stack alignItems="center" spacing={1} sx={{ py: 4, textAlign: "center" }}>
            <MedicalServicesOutlined sx={{ fontSize: 36, color: DISABLED_TEXT }} />
            <Typography sx={{ fontSize: 14, color: MUTED }}>{t("noServicesForSlot")}</Typography>
          </Stack>
        ) : (
          services.map((service) => (
            <ServiceRow
              key={service.id}
              service={service}
              checked={selected.includes(service.id)}
              onToggle={() => onToggle(service.id)}
            />
          ))
        )}
      </Stack>

      {chosen.length > 0 && (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mt: 0.5, pt: 1.5, borderTop: `1px solid ${DIVIDER}` }}
        >
          <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary" }}>
            {formatServicesCount(chosen.length)}
            {totalDuration > 0 && ` · ${formatDuration(totalDuration)}`}
          </Typography>
          <Typography
            sx={{
              fontSize: 15,
              fontWeight: 700,
              color: BOOKING_PRIMARY,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatPrice(totalPrice)}
          </Typography>
        </Stack>
      )}
    </Paper>
  );
};
