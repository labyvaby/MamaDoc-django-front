import React from "react";
import { Box, Button, Chip, CircularProgress, Divider, Drawer, IconButton, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import type { Dayjs } from "dayjs";

import { UserAvatar } from "../../../components/ui";
import type { DjangoEmployeeListItem } from "../../../api/staff";
import type { DayOccurrence } from "./occurrences";
import { employeeColorHex } from "./employeeColors";

export interface ScheduleDayDrawerProps {
  open: boolean;
  onClose: () => void;
  day: Dayjs | null;
  occurrences: DayOccurrence[];
  employeesById: Map<number, DjangoEmployeeListItem>;
  employeeColorMap: Map<number, number>;
  canManage: boolean;
  onMarkDayOff: (employeeId: number) => Promise<void>;
  /** Удаление добавленной вручную смены (исключение kind="extra"). */
  onDeleteShift: (exceptionId: number) => Promise<void>;
  onAddShift: () => void;
}

const ScheduleDayDrawer: React.FC<ScheduleDayDrawerProps> = ({
  open,
  onClose,
  day,
  occurrences,
  employeesById,
  employeeColorMap,
  canManage,
  onMarkDayOff,
  onDeleteShift,
  onAddShift,
}) => {
  const theme = useTheme();
  // Ключ занятой строки — идентичность смены, а не сотрудник: у одного
  // человека в дне может быть и смена по графику, и добавленная вручную.
  const [busyKey, setBusyKey] = React.useState<string | null>(null);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusyKey(key);
    try {
      await action();
    } finally {
      setBusyKey(null);
    }
  };

  const sorted = [...occurrences].sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: "100%", sm: 420 }, maxWidth: "100%" } }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2.5, py: 1.5 }}>
        <Typography variant="h6" fontWeight={600}>
          {day ? day.format("D MMMM") : ""}
        </Typography>
        <IconButton onClick={onClose} aria-label="Закрыть" edge="end">
          <CloseOutlined />
        </IconButton>
      </Box>
      <Divider />

      <Box sx={{ p: 2.5, flex: 1, overflowY: "auto" }}>
        {sorted.length === 0 ? (
          <Typography color="text.secondary" align="center" sx={{ mt: 4 }}>
            Нет смен на этот день
          </Typography>
        ) : (
          <Stack spacing={1}>
            {sorted.map((occ) => {
              const employee = employeesById.get(occ.employeeId);
              const occKey = `${occ.kind}_${occ.sourceId}_${occ.startTime}`;
              const busy = busyKey === occKey;
              const isExtra = occ.kind === "extra";
              return (
                <Box
                  key={occKey}
                  sx={{
                    p: 1.5,
                    borderRadius: "10px",
                    border: "1px solid",
                    borderColor: "divider",
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                  }}
                >
                  <UserAvatar
                    name={occ.employeeName}
                    src={employee?.photoUrl}
                    size={38}
                    sx={{
                      border: `2px solid ${employeeColorHex(
                        // ?? id — сотрудника может не быть в справочнике (см. resourceRows).
                        employeeColorMap.get(occ.employeeId) ?? occ.employeeId,
                        theme.palette.mode,
                      )}`,
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" noWrap>
                      {occ.employeeName}
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" color="text.secondary">
                        {occ.startTime}–{occ.endTime}
                      </Typography>
                      {occ.kind === "extra" && (
                        <Chip label="Смена" size="small" color="success" variant="outlined" />
                      )}
                    </Stack>
                  </Box>
                  {canManage && (
                    <Button
                      size="small"
                      color="error"
                      variant="text"
                      startIcon={
                        busy ? (
                          <CircularProgress size={14} color="inherit" />
                        ) : isExtra ? (
                          <DeleteOutline fontSize="small" />
                        ) : (
                          <EventBusyOutlined fontSize="small" />
                        )
                      }
                      disabled={busy}
                      onClick={() =>
                        isExtra
                          ? runAction(occKey, () => onDeleteShift(occ.sourceId))
                          : runAction(occKey, () => onMarkDayOff(occ.employeeId))
                      }
                      sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
                    >
                      {isExtra ? "Удалить" : "Выходной"}
                    </Button>
                  )}
                </Box>
              );
            })}
          </Stack>
        )}
      </Box>

      {canManage && (
        <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider" }}>
          <Button fullWidth variant="contained" size="large" startIcon={<AddOutlined />} onClick={onAddShift}>
            Добавить смену на этот день
          </Button>
        </Box>
      )}
    </Drawer>
  );
};

export default ScheduleDayDrawer;
