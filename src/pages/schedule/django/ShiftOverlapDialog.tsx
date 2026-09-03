import React from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import LayersOutlined from "@mui/icons-material/LayersOutlined";
import dayjs from "dayjs";

import { AppButton } from "../../../components/ui/AppButton";
import type { ShiftOverlapConflict } from "../../../api/scheduling";

/** «4 сен, 09:00–17:00» — дата пересечения и интервал уже занятой смены. */
function formatOverlap(date: string, start: string, end: string): string {
  const d = dayjs(date);
  const day = d.isValid() ? d.format("D MMM") : date;
  return `${day}, ${start}–${end}`;
}

export interface ShiftOverlapDialogProps {
  /** Не null — диалог открыт; разобранное тело 409 от бэка. */
  conflict: ShiftOverlapConflict | null;
  /** Идёт подтверждающий запрос — обе кнопки заблокированы. */
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Подтверждение пересечения смен одного сотрудника (режим организации `warn`).
 *
 * Проверка идёт по сотруднику, а не по филиалу: человек один и не может вести
 * приём в двух адресах одновременно. Поэтому филиал в списке называется — без
 * адреса предупреждение читалось бы как «пересекается с чем-то где-то».
 * Подтверждение повторяет тот же запрос с `allowOverlap: true`.
 */
const ShiftOverlapDialog: React.FC<ShiftOverlapDialogProps> = ({
  conflict,
  saving,
  onCancel,
  onConfirm,
}) => (
  <Dialog
    open={conflict !== null}
    onClose={saving ? undefined : onCancel}
    maxWidth="xs"
    fullWidth
  >
    <DialogTitle>
      <Stack direction="row" alignItems="center" gap={1}>
        <LayersOutlined color="warning" fontSize="small" />
        Смены пересекаются
      </Stack>
    </DialogTitle>
    <DialogContent>
      <Typography variant="caption" color="text.secondary">
        У сотрудника уже есть смена в это время. Сохранить всё равно?
      </Typography>
      <Stack spacing={1} sx={{ mt: 0.75 }}>
        {(conflict?.overlaps ?? []).map((o, i) => (
          <Box
            key={`${o.kind}-${o.ruleId ?? o.exceptionId ?? i}-${o.date}`}
            sx={{
              borderLeft: "3px solid",
              borderColor: "warning.main",
              pl: 1.25,
              py: 0.25,
            }}
          >
            <Typography variant="body2" fontWeight={600}>
              {formatOverlap(o.date, o.start, o.end)}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div">
              {o.kind === "rule" ? "Смена по графику" : "Отдельная смена"}
              {o.branchName ? ` · ${o.branchName}` : ""}
              {o.otherBranch ? " (другой филиал)" : ""}
            </Typography>
          </Box>
        ))}
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onCancel} disabled={saving}>
        Отмена
      </Button>
      <AppButton
        color="warning"
        variant="contained"
        onClick={onConfirm}
        loading={saving}
        disabled={saving}
      >
        Сохранить
      </AppButton>
    </DialogActions>
  </Dialog>
);

export default ShiftOverlapDialog;
