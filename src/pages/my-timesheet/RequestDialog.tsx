import React from "react";
import {
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import EditCalendarRounded from "@mui/icons-material/EditCalendarRounded";
import { useNotification } from "@refinedev/core";

import { createTimesheetRequest, type TimesheetCode } from "../../api/timesheet";
import { getErrorCode, getErrorFields } from "../../api/client";
import { codeFill, codeInk } from "../timesheet/codeColors";
import { longDate, markableCodes } from "../timesheet/model";

export interface RequestDialogProps {
  open: boolean;
  date: string | null;
  codes: TimesheetCode[];
  organizationId?: number | null;
  onClose: () => void;
  onCreated: () => void;
}

/** Заявка сотрудника: «был с 9 до 18, забыл отметиться». */
export const RequestDialog: React.FC<RequestDialogProps> = ({
  open,
  date,
  codes,
  organizationId,
  onClose,
  onCreated,
}) => {
  const theme = useTheme();
  const { open: notify } = useNotification();
  const [code, setCode] = React.useState("presence");
  const [startTime, setStartTime] = React.useState("09:00");
  const [endTime, setEndTime] = React.useState("18:00");
  const [reason, setReason] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setCode("presence");
    setStartTime("09:00");
    setEndTime("18:00");
    setReason("");
    setErrors({});
  }, [open, date]);

  const available = markableCodes(codes).filter((item) => item.key !== "absence" && item.key !== "day_off");
  const withTimes = code === "presence" || codes.find((c) => c.key === code)?.category === "work";

  const submit = async () => {
    if (!date) return;
    setSaving(true);
    setErrors({});
    try {
      await createTimesheetRequest(
        {
          date,
          code,
          reason,
          ...(withTimes ? { startTime, endTime } : {}),
        },
        organizationId,
      );
      notify?.({ type: "success", message: "Заявка отправлена руководителю" });
      onCreated();
      onClose();
    } catch (error) {
      const name = getErrorCode(error);
      if (name === "REQUEST_EXISTS") {
        notify?.({ type: "error", message: "Заявка на этот день уже ждёт решения" });
      } else if (name === "TIMESHEET_CLOSED") {
        notify?.({ type: "error", message: "Табель этого месяца уже закрыт" });
      } else {
        setErrors(getErrorFields(error) ?? { reason: error instanceof Error ? error.message : "Ошибка" });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: "18px" } }}>
      <DialogTitle>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: "11px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "primary.main",
              bgcolor: alpha(theme.palette.primary.main, 0.12),
            }}
          >
            <EditCalendarRounded />
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={800} lineHeight={1.2}>
              Исправить день
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {date ? longDate(date) : ""}
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Руководитель увидит заявку и подтвердит её — день исправится в табеле.
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 0.75 }}>
          {available.map((item) => {
            const selected = item.key === code;
            return (
              <ButtonBase
                key={item.key}
                onClick={() => setCode(item.key)}
                sx={{
                  p: 0.75,
                  gap: 0.75,
                  borderRadius: "10px",
                  justifyContent: "flex-start",
                  border: `1px solid ${selected ? item.color : theme.palette.divider}`,
                  bgcolor: selected ? codeFill(theme, item.color, 1.2) : "transparent",
                }}
              >
                <Box
                  sx={{
                    minWidth: 24,
                    height: 24,
                    px: 0.5,
                    borderRadius: "7px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 900,
                    color: codeInk(theme, item.color),
                    bgcolor: codeFill(theme, item.color, 1.3),
                  }}
                >
                  {item.letter}
                </Box>
                <Typography variant="caption" fontWeight={700} noWrap>
                  {item.name}
                </Typography>
              </ButtonBase>
            );
          })}
        </Box>
        {withTimes && (
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <TextField
              type="time"
              label="Пришёл"
              size="small"
              fullWidth
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              type="time"
              label="Ушёл"
              size="small"
              fullWidth
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              InputLabelProps={{ shrink: true }}
              error={Boolean(errors.endTime)}
              helperText={errors.endTime}
            />
          </Stack>
        )}
        <TextField
          label="Что случилось"
          placeholder="Например: забыл отметиться, был на выезде у клиента"
          fullWidth
          multiline
          minRows={2}
          size="small"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={Boolean(errors.reason || errors.date)}
          helperText={errors.reason || errors.date}
          sx={{ mt: 2 }}
          inputProps={{ maxLength: 500 }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Отмена</Button>
        <Button
          variant="contained"
          disabled={saving || !reason.trim()}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
          onClick={() => void submit()}
          sx={{ borderRadius: "10px" }}
        >
          Отправить
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RequestDialog;
