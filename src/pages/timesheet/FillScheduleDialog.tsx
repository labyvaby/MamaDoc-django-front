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
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import EventRepeatRounded from "@mui/icons-material/EventRepeatRounded";

import { subtleBg } from "../../theme/uiHelpers";
import { monthLabel, plural } from "./model";

export type FillRange = "today" | "month";

export interface FillScheduleDialogProps {
  open: boolean;
  month: string;
  isCurrentMonth: boolean;
  missingDays: number;
  selectedEmployees: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (range: FillRange, onlySelected: boolean) => void;
}

export const FillScheduleDialog: React.FC<FillScheduleDialogProps> = ({
  open,
  month,
  isCurrentMonth,
  missingDays,
  selectedEmployees,
  busy,
  onClose,
  onConfirm,
}) => {
  const theme = useTheme();
  const [range, setRange] = React.useState<FillRange>("today");
  const [onlySelected, setOnlySelected] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setRange(isCurrentMonth ? "today" : "month");
      setOnlySelected(selectedEmployees > 0);
    }
  }, [open, isCurrentMonth, selectedEmployees]);

  const option = (key: FillRange, title: string, hint: string) => (
    <ButtonBase
      onClick={() => setRange(key)}
      sx={{
        flex: 1,
        p: 1.5,
        borderRadius: "12px",
        textAlign: "left",
        display: "block",
        border: 1,
        borderColor: range === key ? "primary.main" : "divider",
        bgcolor: range === key ? alpha(theme.palette.primary.main, 0.08) : "transparent",
        boxShadow: range === key ? `0 0 0 3px ${alpha(theme.palette.primary.main, 0.12)}` : "none",
        transition: "all .15s ease",
      }}
    >
      <Typography variant="body2" fontWeight={800}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {hint}
      </Typography>
    </ButtonBase>
  );

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
            <EventRepeatRounded />
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={800} lineHeight={1.2}>
              Заполнить по графику
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {monthLabel(month)}
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          В пустые рабочие дни по графику встанет «Я» с плановыми часами. Дни со сменами СКУД,
          отпусками, больничными и праздниками не меняются.
        </Typography>
        <Stack direction="row" spacing={1}>
          {option("today", "Прошедшие дни", isCurrentMonth ? "до вчера: сегодня ещё отмечаются" : "весь прошедший месяц")}
          {option("month", "Весь месяц", "и сегодня, и дни впереди")}
        </Stack>
        {selectedEmployees > 0 && (
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <ButtonBase
              onClick={() => setOnlySelected(false)}
              sx={{
                flex: 1,
                p: 1,
                borderRadius: "10px",
                border: 1,
                borderColor: !onlySelected ? "primary.main" : "divider",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              Всем сотрудникам
            </ButtonBase>
            <ButtonBase
              onClick={() => setOnlySelected(true)}
              sx={{
                flex: 1,
                p: 1,
                borderRadius: "10px",
                border: 1,
                borderColor: onlySelected ? "primary.main" : "divider",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              Только выделенным ({selectedEmployees})
            </ButtonBase>
          </Stack>
        )}
        {missingDays > 0 && (
          <Box sx={{ mt: 2, p: 1.25, borderRadius: "12px", bgcolor: subtleBg(theme) }}>
            <Typography variant="body2">
              Сейчас пропусков: <b>{plural(missingDays, "день", "дня", "дней")}</b> — заполнятся первыми.
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Отмена</Button>
        <Button
          variant="contained"
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          onClick={() => onConfirm(range, onlySelected)}
          sx={{ borderRadius: "10px" }}
        >
          Заполнить
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FillScheduleDialog;
