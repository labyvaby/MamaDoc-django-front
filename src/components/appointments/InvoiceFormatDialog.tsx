import React from "react";
import {
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";

import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme";
import {
  readInvoicePageSize,
  saveInvoicePageSize,
  type InvoicePageSize,
} from "./appointmentInvoice";

export interface InvoiceFormatDialogProps {
  open: boolean;
  onCancel: () => void;
  /** Формат уже сохранён в настройках пользователя — печатать этим листом. */
  onConfirm: (pageSize: InvoicePageSize) => void;
}

/**
 * Выбор листа перед печатью чека: A5 (кассовый бланк) или A4 (обычный лист).
 * Диалог открывается с последним выбранным форматом — кассир, печатающий
 * всегда одинаково, подтверждает его одним кликом.
 */
const InvoiceFormatDialog: React.FC<InvoiceFormatDialogProps> = ({ open, onCancel, onConfirm }) => {
  const { t } = useT("appointments");
  const [pageSize, setPageSize] = React.useState<InvoicePageSize>(readInvoicePageSize);

  // Диалог остаётся смонтированным между открытиями, поэтому подхватываем
  // сохранённый формат на каждом показе, а не только при первом рендере.
  React.useEffect(() => {
    if (open) setPageSize(readInvoicePageSize());
  }, [open]);

  const confirm = () => {
    saveInvoicePageSize(pageSize);
    onConfirm(pageSize);
  };

  const options: { value: InvoicePageSize; icon: React.ReactNode; title: string; hint: string }[] = [
    {
      value: "A5",
      icon: <ReceiptLongOutlined fontSize="small" />,
      title: t("invoice.formatA5"),
      hint: t("invoice.formatA5Hint"),
    },
    {
      value: "A4",
      icon: <DescriptionOutlined fontSize="small" />,
      title: t("invoice.formatA4"),
      hint: t("invoice.formatA4Hint"),
    },
  ];

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" gap={1}>
          <PrintOutlined fontSize="small" color="action" />
          {t("invoice.formatTitle")}
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack gap={1}>
          {options.map((option) => {
            const selected = pageSize === option.value;
            return (
              <ButtonBase
                key={option.value}
                onClick={() => setPageSize(option.value)}
                onDoubleClick={confirm}
                sx={{
                  justifyContent: "flex-start",
                  textAlign: "left",
                  borderRadius: 1,
                  border: "1px solid",
                  borderColor: selected ? "primary.main" : "divider",
                  bgcolor: (theme) => (selected ? subtleBg(theme, true) : "transparent"),
                  px: 1.5,
                  py: 1.25,
                }}
                aria-pressed={selected}
              >
                <Stack direction="row" alignItems="center" gap={1.5} width="100%">
                  <Box sx={{ color: selected ? "primary.main" : "text.secondary", display: "flex" }}>
                    {option.icon}
                  </Box>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      {option.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {option.hint}
                    </Typography>
                  </Box>
                </Stack>
              </ButtonBase>
            );
          })}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button color="inherit" onClick={onCancel}>
          {t("invoice.formatCancel")}
        </Button>
        <Button variant="contained" onClick={confirm} startIcon={<PrintOutlined />}>
          {t("invoice.formatConfirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default InvoiceFormatDialog;
