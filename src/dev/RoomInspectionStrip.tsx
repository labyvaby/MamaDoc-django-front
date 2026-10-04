/**
 * Полоса «Проверка номера перед выездом» в карточке брони проживающего гостя:
 * отправить номер горничной на проверку (с выбором, кому), видно, что она
 * ответила, — «всё в порядке» или замечания, по которым можно сразу
 * начислить услугу (поломка, мини-бар).
 */
import React from "react";
import { Box, Button, CircularProgress, ListSubheader, Menu, MenuItem, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import HourglassTopOutlined from "@mui/icons-material/HourglassTopOutlined";
import { useSnackbar } from "notistack";

import { getErrorMessage } from "../api/client";
import { useHotelEmployees } from "./useHotelEmployees";
import type { RoomInspection } from "./useRoomInspection";

export const RoomInspectionStrip: React.FC<{ inspection: RoomInspection; roomNumber: string | null; onAddCharge?: () => void }> = ({
  inspection,
  roomNumber,
  onAddCharge,
}) => {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const employeesQuery = useHotelEmployees(anchor != null);

  if (!inspection.visible) return null;
  const { state, task, result } = inspection;
  const tone =
    state === "ok" ? theme.palette.success.main : state === "issues" ? theme.palette.warning.main : state === "none" ? theme.palette.text.secondary : theme.palette.info.main;
  const icon =
    state === "ok" ? <CheckCircleOutlined /> : state === "issues" ? <WarningAmberOutlined /> : state === "none" ? <FactCheckOutlined /> : <HourglassTopOutlined />;
  const title =
    state === "ok"
      ? "Номер проверен — всё в порядке"
      : state === "issues"
        ? `Замечания по номеру: ${result?.text ?? ""}`
        : state === "checking"
          ? "Горничная проверяет номер"
          : state === "requested"
            ? "Номер ждёт проверки"
            : "Перед выездом — проверить номер";
  const subtitle =
    state === "ok" || state === "issues"
      ? result?.signature
      : state === "requested" || state === "checking"
        ? task?.assignedToName
          ? `проверяет ${task.assignedToName}`
          : "горничная не назначена — увидит любая"
        : `Отправьте номер ${roomNumber ?? ""} горничной: полотенца, мини-бар, поломки — ответ придёт сюда`;

  const request = async (assignedToId?: number | null) => {
    setAnchor(null);
    try {
      await inspection.request(assignedToId);
      enqueueSnackbar("Номер отправлен на проверку", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, "Не удалось отправить на проверку"), { variant: "error" });
    }
  };
  const cancel = async () => {
    try {
      await inspection.cancel();
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, "Не удалось отменить проверку"), { variant: "error" });
    }
  };

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      alignItems={{ xs: "stretch", sm: "center" }}
      gap={1.25}
      sx={{
        mt: 2,
        px: 1.75,
        py: 1.25,
        borderRadius: "12px",
        border: `1px solid ${alpha(tone, 0.28)}`,
        bgcolor: alpha(tone, theme.palette.mode === "dark" ? 0.12 : 0.06),
      }}
    >
      <Stack direction="row" alignItems="center" gap={1.25} sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ color: tone, display: "flex", "& svg": { fontSize: 22 } }}>{icon}</Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" fontWeight={700}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary" component="div">
              {subtitle}
            </Typography>
          )}
        </Box>
      </Stack>
      <Stack direction="row" gap={1} justifyContent="flex-end">
        {inspection.loading ? (
          <CircularProgress size={18} />
        ) : state === "none" ? (
          inspection.canManage && (
            <Button size="small" variant="outlined" disabled={inspection.busy} onClick={(e) => setAnchor(e.currentTarget)}>
              Отправить на проверку
            </Button>
          )
        ) : state === "issues" ? (
          onAddCharge && (
            <Button size="small" variant="outlined" onClick={onAddCharge}>
              Начислить
            </Button>
          )
        ) : state !== "ok" && inspection.canManage ? (
          <Button size="small" color="inherit" disabled={inspection.busy} onClick={() => void cancel()}>
            Отменить
          </Button>
        ) : null}
      </Stack>
      <Menu anchorEl={anchor} open={anchor != null} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => void request(null)}>
          <Typography variant="body2" fontWeight={600}>
            Любой горничной
          </Typography>
        </MenuItem>
        <ListSubheader sx={{ lineHeight: "32px" }}>Или конкретно</ListSubheader>
        {employeesQuery.isPending ? (
          <MenuItem disabled>Загружаем сотрудников…</MenuItem>
        ) : (
          (employeesQuery.data ?? []).map((emp) => (
            <MenuItem key={emp.id} onClick={() => void request(emp.id)}>
              {emp.fullName}
            </MenuItem>
          ))
        )}
      </Menu>
    </Stack>
  );
};

export default RoomInspectionStrip;
