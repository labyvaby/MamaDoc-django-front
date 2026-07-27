import React from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import EventOutlined from "@mui/icons-material/EventOutlined";
import dayjs from "dayjs";
import { useT } from "../../../i18n/VerticalProvider";

export type CashDateChoice = "today" | "appointment";

export interface CashDateConfirmDialogProps {
  open: boolean;
  /** ISO date (YYYY-MM-DD) for "today". */
  todayDate: string;
  /** ISO date (YYYY-MM-DD) for the appointment's own date. */
  appointmentDate: string;
  onChoose: (choice: CashDateChoice) => void;
  onCancel: () => void;
}

/**
 * Asked once per save when the appointment's date differs from today and the
 * payment includes a card/insurance amount: which date should this money
 * count toward in the cashbox — today, or the appointment's own date (e.g.
 * a backdated payment or a pre-payment for a future visit)? Cash is never
 * asked — it's always today's running balance regardless of the visit date.
 */
const CashDateConfirmDialog: React.FC<CashDateConfirmDialogProps> = ({
  open,
  todayDate,
  appointmentDate,
  onChoose,
  onCancel,
}) => {
  const { t } = useT("appointments");
  const todayLabel = dayjs(todayDate).format("D MMMM");
  const appointmentLabel = dayjs(appointmentDate).format("D MMMM");
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" gap={1}>
          <EventOutlined color="warning" fontSize="small" />
          {t("cashDateDialog.title")}
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          {t("cashDateDialog.text")}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ flexDirection: "column", alignItems: "stretch", gap: 1, px: 3, pb: 2 }}>
        <Button
          fullWidth
          variant="outlined"
          onClick={() => onChoose("today")}
        >
          {t("cashDateDialog.today", { date: todayLabel })}
        </Button>
        <Button
          fullWidth
          variant="contained"
          onClick={() => onChoose("appointment")}
        >
          {t("cashDateDialog.appointmentDate", { date: appointmentLabel })}
        </Button>
        <Button fullWidth color="inherit" onClick={onCancel}>
          {t("cashDateDialog.cancel")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CashDateConfirmDialog;
