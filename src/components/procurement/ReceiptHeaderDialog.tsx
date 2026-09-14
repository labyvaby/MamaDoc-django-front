import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import dayjs, { type Dayjs } from "dayjs";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import { getErrorMessage } from "../../api/client";
import type { GoodsReceipt, GoodsReceiptUpdateData } from "../../api/procurement";
import { CustomDatePicker } from "../ui";

export interface ReceiptHeaderDialogProps {
  receipt: GoodsReceipt | null;
  onClose: () => void;
  onSave: (receipt: GoodsReceipt, data: GoodsReceiptUpdateData) => Promise<void>;
}

/**
 * Правка шапки проведённой накладной: номер, номер поставщика, срок оплаты,
 * комментарий. Состав и склад не правятся — за ними стоят партии; их меняет
 * только отмена и новая накладная.
 */
export const ReceiptHeaderDialog: React.FC<ReceiptHeaderDialogProps> = ({ receipt, onClose, onSave }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const [number, setNumber] = React.useState("");
  const [supplierNumber, setSupplierNumber] = React.useState("");
  const [dueAt, setDueAt] = React.useState<Dayjs | null>(null);
  const [comment, setComment] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!receipt) return;
    setNumber(receipt.number);
    setSupplierNumber(receipt.supplierNumber);
    setDueAt(receipt.dueAt ? dayjs(receipt.dueAt) : null);
    setComment(receipt.comment);
    setError(null);
  }, [receipt]);

  const handleSave = async () => {
    if (!receipt || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(receipt, {
        number: number.trim(),
        supplierNumber: supplierNumber.trim(),
        comment: comment.trim(),
        dueAt: dueAt ? dueAt.endOf("day").toISOString() : null,
      });
      onClose();
    } catch (e) {
      setError(getErrorMessage(e, "Не удалось сохранить накладную"));
    } finally {
      setSaving(false);
    }
  };

  const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontWeight: 600 }}>
      {children}
    </Typography>
  );

  return (
    <Dialog open={receipt != null} onClose={saving ? undefined : onClose} fullScreen={fullScreen} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: fullScreen ? 0 : "14px" } }}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}>
        <Box>
          <Typography variant="h6" component="div">
            Шапка накладной
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {receipt?.number} · {receipt?.supplierName}
          </Typography>
        </Box>
        <IconButton size="small" onClick={saving ? undefined : onClose} aria-label="Закрыть">
          <CloseOutlined fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <Alert severity="info" sx={{ py: 0 }}>
            Позиции и склад после проведения не меняются — при ошибке отмените накладную и проведите заново.
          </Alert>
          <Box>
            <Label>Номер накладной *</Label>
            <TextField fullWidth size="small" value={number} onChange={(e) => setNumber(e.target.value)} />
          </Box>
          <Box>
            <Label>Номер у поставщика</Label>
            <TextField fullWidth size="small" value={supplierNumber} onChange={(e) => setSupplierNumber(e.target.value)} />
          </Box>
          <Box>
            <Label>Срок оплаты</Label>
            <CustomDatePicker value={dueAt} onChange={(v) => setDueAt(v as Dayjs | null)} shortYearMode="future" slotProps={{ textField: { size: "small", fullWidth: true, placeholder: "Не оговорён" } }} />
          </Box>
          <Box>
            <Label>Комментарий</Label>
            <TextField fullWidth size="small" multiline rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1 }}>
        <Button variant="outlined" color="inherit" onClick={onClose} disabled={saving} sx={{ borderColor: "divider" }}>
          Отмена
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || number.trim() === ""} startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}>
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReceiptHeaderDialog;
