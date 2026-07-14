import React from "react";
import { Box, Button, Chip, CircularProgress, Divider, Drawer, IconButton, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
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
  onAddShift,
}) => {
  const theme = useTheme();
  const [busyEmployeeId, setBusyEmployeeId] = React.useState<number | null>(null);

  const handleMarkDayOff = async (employeeId: number) => {
    setBusyEmployeeId(employeeId);
    try {
      await onMarkDayOff(employeeId);
    } finally {
      setBusyEmployeeId(null);
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
              return (
                <Box
                  key={`${occ.kind}_${occ.sourceId}_${occ.startTime}`}
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
                        <Chip label="Доп. смена" size="small" color="success" variant="outlined" />
                      )}
                    </Stack>
                  </Box>
                  {canManage && (
                    <Button
                      size="small"
                      color="error"
                      variant="text"
                      startIcon={
                        busyEmployeeId === occ.employeeId ? (
                          <CircularProgress size={14} color="inherit" />
                        ) : (
                          <EventBusyOutlined fontSize="small" />
                        )
                      }
                      disabled={busyEmployeeId === occ.employeeId}
                      onClick={() => handleMarkDayOff(occ.employeeId)}
                      sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
                    >
                      Выходной
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
