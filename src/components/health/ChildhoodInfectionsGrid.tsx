import React from "react";
import { Alert, Box, Stack, Typography, alpha, useTheme } from "@mui/material";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";
import InfoOutlined from "@mui/icons-material/InfoOutlined";

import type { InfectionSummary } from "../../api/health";
import type { PatientGender } from "../../api/patients";
import { subtleBorder } from "../../theme/uiHelpers";
import { AppButton } from "../ui";
import { byGender, infectionConflictText, infectionStatusText, infectionVaccineHint } from "./illnessData";

/** Отметка состояния: болел(а) — залитый круг, не болел(а) — галочка, нет сведений — пунктир. */
const StatusMark: React.FC<{ info: InfectionSummary }> = ({ info }) => {
  const theme = useTheme();
  const size = 22;
  if (info.status === "had") {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: "50%",
          flexShrink: 0,
          bgcolor: info.derived ? alpha(theme.palette.warning.main, 0.35) : theme.palette.warning.main,
          border: info.derived ? `2px dashed ${theme.palette.warning.main}` : undefined,
        }}
      />
    );
  }
  if (info.status === "not_had") {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: "50%",
          flexShrink: 0,
          border: `2px solid ${theme.palette.success.main}`,
          color: theme.palette.success.onSurface,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CheckOutlined sx={{ fontSize: 14 }} />
      </Box>
    );
  }
  return <Box sx={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, border: `2px dashed ${theme.palette.text.disabled}` }} />;
};

interface ChildhoodInfectionsGridProps {
  infections: ReadonlyArray<InfectionSummary>;
  gender?: PatientGender | null;
  canManage: boolean;
  /** «Не болела» одной кнопкой: сохраняется сразу, со слов родителей. */
  onNotHad: (info: InfectionSummary) => void;
  /** Какая инфекция сейчас сохраняется кнопкой. */
  savingInfection: string | null;
  onOpen: (info: InfectionSummary, mode: "edit" | "had" | "confirm") => void;
}

/**
 * Детские инфекции сеткой отметок (§3.7, §4.1): итог по каждой, подсказка о
 * прививке, предупреждение о расхождении с приёмами и быстрые кнопки.
 */
export const ChildhoodInfectionsGrid: React.FC<ChildhoodInfectionsGridProps> = ({
  infections,
  gender,
  canManage,
  onNotHad,
  savingInfection,
  onOpen,
}) => {
  const theme = useTheme();
  return (
    <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" } }}>
      {infections.map((info) => {
        const hint = infectionVaccineHint(info, gender);
        const conflict = infectionConflictText(info, gender);
        const record = info.record;
        const empty = !record || record.status === "unknown";
        const known = info.status !== "unknown";
        return (
          <Box
            key={info.infection}
            sx={{
              p: 1.5,
              borderRadius: "14px",
              border: `1px solid ${conflict ? alpha(theme.palette.warning.main, 0.55) : known ? theme.palette.divider : subtleBorder(theme)}`,
              bgcolor: info.status === "had" ? alpha(theme.palette.warning.main, theme.palette.mode === "dark" ? 0.07 : 0.04) : "transparent",
              display: "flex",
              flexDirection: "column",
              gap: 1,
              minWidth: 0,
            }}
          >
            <Stack direction="row" gap={1.25} alignItems="flex-start">
              <StatusMark info={info} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" gap={0.75} alignItems="baseline" flexWrap="wrap">
                  <Typography variant="body2" fontWeight={700}>
                    {info.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {info.codes.join(", ")}
                  </Typography>
                </Stack>
                <Typography variant="body2" color={known ? "text.primary" : "text.secondary"}>
                  {infectionStatusText(info, gender)}
                </Typography>
              </Box>
            </Stack>
            {hint && (
              <Stack direction="row" gap={0.75} alignItems="flex-start">
                <InfoOutlined sx={{ fontSize: 16, mt: "2px", color: "info.main" }} />
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45 }}>
                  {hint}
                </Typography>
              </Stack>
            )}
            {conflict && (
              <Alert severity="warning" sx={{ py: 0, "& .MuiAlert-message": { fontSize: 13 } }}>
                {conflict}
              </Alert>
            )}
            {canManage && (
              <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: "auto" }}>
                {info.derived && (
                  <AppButton size="small" variant="contained" startIcon={<FactCheckOutlined />} onClick={() => onOpen(info, "confirm")}>
                    Подтвердить
                  </AppButton>
                )}
                {empty && !info.derived && (
                  <>
                    <AppButton
                      size="small"
                      variant="outlined"
                      loading={savingInfection === info.infection}
                      onClick={() => onNotHad(info)}
                    >
                      {byGender(gender, "Не болела", "Не болел", "Не болел(а)")}
                    </AppButton>
                    <AppButton size="small" variant="outlined" onClick={() => onOpen(info, "had")}>
                      {byGender(gender, "Болела…", "Болел…", "Болел(а)…")}
                    </AppButton>
                  </>
                )}
                {conflict && (
                  <AppButton size="small" variant="outlined" startIcon={<FactCheckOutlined />} onClick={() => onOpen(info, "confirm")}>
                    {byGender(gender, "Болела — из приёма", "Болел — из приёма", "Болел(а) — из приёма")}
                  </AppButton>
                )}
                {!empty && (
                  <AppButton size="small" startIcon={<EditOutlined />} onClick={() => onOpen(info, "edit")}>
                    Изменить
                  </AppButton>
                )}
              </Stack>
            )}
          </Box>
        );
      })}
    </Box>
  );
};
