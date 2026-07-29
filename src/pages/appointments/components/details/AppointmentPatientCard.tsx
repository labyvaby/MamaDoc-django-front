import React from "react";
import { Avatar, Box, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import BlockOutlined from "@mui/icons-material/BlockOutlined";
import StickyNote2Outlined from "@mui/icons-material/StickyNote2Outlined";

import type { AppointmentPatientShort } from "../../../../api/appointments";
import { formatPhoneDisplay } from "../../../../utility/phone";
import { subtleBg } from "../../../../theme";
import { useT } from "../../../../i18n/VerticalProvider";

export interface AppointmentPatientCardProps {
  patient: AppointmentPatientShort | null;
  /** Возраст из карты пациента («5 лет 2 месяца»); пусто — не показывать. */
  age?: string;
  /** Пациент в чёрном списке (из карты пациента). */
  isBlacklisted?: boolean;
  blacklistReason?: string;
  /** Комментарий администратора к приёму. */
  adminComment?: string | null;
  onOpenPatient?: () => void;
}

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/**
 * Пациент — первый блок карточки приёма: имя, возраст и телефон нужны чаще
 * всего (позвонить, подтвердить визит), поэтому они выше даты и финансов, а
 * номер набран крупно и с кнопкой копирования (на десктопе `tel:` бесполезен,
 * регистратору нужен номер в буфере).
 *
 * Здесь же предупреждения — чёрный список и комментарий администратора: первое
 * раньше показывал только дровер создания приёма, второе лежало в самом низу
 * карточки, ниже жалоб.
 */
const AppointmentPatientCard: React.FC<AppointmentPatientCardProps> = ({
  patient,
  age,
  isBlacklisted,
  blacklistReason,
  adminComment,
  onOpenPatient,
}) => {
  const { t } = useT("appointments");
  const theme = useTheme();
  const [phoneCopied, setPhoneCopied] = React.useState(false);

  const copyPhone = React.useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!patient?.phone) return;
      try {
        await navigator.clipboard.writeText(patient.phone);
        setPhoneCopied(true);
        window.setTimeout(() => setPhoneCopied(false), 1500);
      } catch {
        /* буфер недоступен (нет https / отказ в правах) — тихо игнорируем */
      }
    },
    [patient?.phone],
  );

  return (
    <Stack spacing={1}>
      {patient ? (
        <Paper
          variant="outlined"
          onClick={onOpenPatient}
          sx={{
            p: 1.75,
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            borderRadius: "12px",
            bgcolor: subtleBg(theme),
            cursor: onOpenPatient ? "pointer" : "default",
            transition: "background-color 0.2s, border-color 0.2s",
            ...(onOpenPatient && {
              "&:hover": { bgcolor: subtleBg(theme, true), borderColor: "primary.main" },
            }),
          }}
        >
          <Avatar
            src={patient.photoUrl ?? undefined}
            sx={{
              width: 52,
              height: 52,
              bgcolor: "primary.light",
              color: "primary.contrastText",
              fontWeight: 700,
              fontSize: "1.15rem",
              flexShrink: 0,
            }}
          >
            {initials(patient.fullName)}
          </Avatar>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1" fontWeight={700} noWrap sx={{ lineHeight: 1.25 }}>
                {patient.fullName}
              </Typography>
              {/* Возраст — в педиатрии определяет и дозу, и тон разговора. */}
              {age && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
                >
                  {age}
                </Typography>
              )}
            </Stack>

            {patient.phone && (
              <Stack
                direction="row"
                alignItems="center"
                spacing={0.75}
                sx={{ mt: 0.25, minWidth: 0 }}
              >
                <PhoneOutlined sx={{ fontSize: 17, color: "primary.main" }} />
                <Typography
                  component="a"
                  href={`tel:${patient.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  noWrap
                  sx={{
                    fontSize: "1.0625rem",
                    fontWeight: 700,
                    letterSpacing: 0.2,
                    fontVariantNumeric: "tabular-nums",
                    color: "primary.main",
                    textDecoration: "none",
                    "&:hover": { textDecoration: "underline" },
                  }}
                >
                  {formatPhoneDisplay(patient.phone)}
                </Typography>
                <Tooltip title={phoneCopied ? t("details.phoneCopied") : t("details.copyPhone")}>
                  <IconButton size="small" onClick={copyPhone} sx={{ p: 0.375 }}>
                    <ContentCopyOutlined sx={{ fontSize: 15 }} />
                  </IconButton>
                </Tooltip>
              </Stack>
            )}
          </Box>
        </Paper>
      ) : (
        <Paper
          variant="outlined"
          sx={{
            p: 1.75,
            bgcolor: alpha(theme.palette.warning.main, 0.04),
            borderRadius: "12px",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {t("details.bookingWithoutPatient")}
          </Typography>
        </Paper>
      )}

      {isBlacklisted && (
        <Paper
          variant="outlined"
          sx={{
            p: 1.25,
            display: "flex",
            alignItems: "flex-start",
            gap: 1,
            borderRadius: "10px",
            bgcolor: alpha(theme.palette.error.main, 0.06),
            borderColor: alpha(theme.palette.error.main, 0.4),
          }}
        >
          <BlockOutlined sx={{ fontSize: 18, color: "error.main", mt: 0.125 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" fontWeight={700} color="error.main">
              {t("details.blacklisted")}
            </Typography>
            {blacklistReason && (
              <Typography variant="caption" color="text.secondary">
                {blacklistReason}
              </Typography>
            )}
          </Box>
        </Paper>
      )}

      {adminComment && (
        <Paper
          variant="outlined"
          sx={{
            p: 1.25,
            display: "flex",
            alignItems: "flex-start",
            gap: 1,
            borderRadius: "10px",
            bgcolor: alpha(theme.palette.warning.main, 0.05),
            borderColor: alpha(theme.palette.warning.main, 0.3),
          }}
        >
          <StickyNote2Outlined sx={{ fontSize: 18, color: "warning.main", mt: 0.125 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              {t("details.adminComment")}
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
              {adminComment}
            </Typography>
          </Box>
        </Paper>
      )}
    </Stack>
  );
};

export default AppointmentPatientCard;
