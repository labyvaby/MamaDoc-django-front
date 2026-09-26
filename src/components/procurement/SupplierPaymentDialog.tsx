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
  MenuItem,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import dayjs, { type Dayjs } from "dayjs";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";

import { getErrorMessage } from "../../api/client";
import {
  CASHLESS_SUPPLIER_METHODS,
  SUPPLIER_PAYMENT_METHOD_LABEL,
  createPayment,
  type GoodsReceipt,
  type ProcurementScope,
  type ProcurementSupplier,
  type SupplierPaymentMethod,
} from "../../api/procurement";
import { djangoQueryKeys } from "../../api/queryKeys";
import { useCashlessMethods } from "../../hooks/useCashlessMethods";
import { CashlessMethodSelect, CustomDatePicker, SegmentedTabs } from "../ui";
import { formatMoney } from "./meta";

export interface SupplierPaymentDialogProps {
  open: boolean;
  onClose: () => void;
  scope: ProcurementScope;
  /** Филиал операции — для справочника способов безнала. */
  branchId: number | null;
  suppliers: ProcurementSupplier[];
  /** Оплата по накладной: поставщик и сумма подставляются из неё. */
  receipt?: GoodsReceipt | null;
  /** Оплата «в счёт долга» поставщику без накладной. */
  supplier?: ProcurementSupplier | null;
}

const METHODS: SupplierPaymentMethod[] = ["cash", "card", "cashless", "offset"];

/**
 * «Оплата поставщику»: по накладной (сумма ограничена её остатком) или в счёт
 * долга (ограничена задолженностью). Для карты и безнала нужен способ из
 * справочника — то же правило, что у оплаты чека.
 */
export const SupplierPaymentDialog: React.FC<SupplierPaymentDialogProps> = ({
  open,
  onClose,
  scope,
  branchId,
  suppliers,
  receipt,
  supplier,
}) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();

  const [supplierId, setSupplierId] = React.useState<number | "">("");
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<SupplierPaymentMethod>("cash");
  const [cashlessMethodId, setCashlessMethodId] = React.useState<number | "">("");
  const [paidAt, setPaidAt] = React.useState<Dayjs | null>(dayjs());
  const [documentNumber, setDocumentNumber] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const cashless = useCashlessMethods(open, { organizationId: scope.organizationId ?? null, branchId });
  const needsCashless = CASHLESS_SUPPLIER_METHODS.includes(method);

  React.useEffect(() => {
    if (!open) return;
    const initialSupplier = receipt?.supplierId ?? supplier?.id ?? "";
    setSupplierId(initialSupplier);
    setAmount(receipt ? String(Number(receipt.remainingTotal)) : supplier && Number(supplier.payable) > 0 ? String(Number(supplier.payable)) : "");
    setMethod("cash");
    setCashlessMethodId("");
    setPaidAt(dayjs());
    setDocumentNumber("");
    setComment("");
    setError(null);
  }, [open, receipt, supplier]);

  React.useEffect(() => {
    if (needsCashless && cashlessMethodId === "" && cashless.defaultMethodId !== "") setCashlessMethodId(cashless.defaultMethodId);
  }, [needsCashless, cashless.defaultMethodId, cashlessMethodId]);

  const current = suppliers.find((s) => s.id === supplierId) ?? null;
  const limit = receipt ? Number(receipt.remainingTotal) : current?.payable != null ? Number(current.payable) : null;
  const amountNum = Number(String(amount).replace(",", ".").replace(/\s/g, ""));
  const amountValid = Number.isFinite(amountNum) && amountNum > 0 && (limit == null || amountNum <= limit + 0.005);
  const cashlessValid = !needsCashless || (cashlessMethodId !== "" && !cashless.blocksSubmit);
  const isValid = supplierId !== "" && amountValid && cashlessValid;

  const handleSubmit = async () => {
    if (!isValid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await createPayment(
        {
          supplierId: Number(supplierId),
          amount: String(amountNum),
          paymentMethod: method,
          cashlessMethodId: needsCashless && cashlessMethodId !== "" ? Number(cashlessMethodId) : null,
          paidAt: paidAt ? paidAt.toISOString() : null,
          goodsReceiptId: receipt?.id ?? null,
          documentNumber: documentNumber.trim(),
          comment: comment.trim(),
          branchId: branchId ?? null,
        },
        scope,
      );
      await queryClient.invalidateQueries({ queryKey: djangoQueryKeys.procurement.all });
      notify?.({ type: "success", message: `Оплата ${formatMoney(amountNum)} сом проведена` });
      onClose();
    } catch (e) {
      setError(getErrorMessage(e, "Не удалось провести оплату"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullScreen={fullScreen} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: fullScreen ? 0 : "14px" } }}>
      <DialogTitle sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", pb: 1 }}>
        <Box>
          <Typography variant="h6" component="div">
            Оплата поставщику
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {receipt ? `${receipt.supplierName} · по накладной ${receipt.number}` : current ? `${current.name} · в счёт задолженности` : "В счёт задолженности"}
          </Typography>
        </Box>
        <IconButton size="small" onClick={saving ? undefined : onClose} aria-label="Закрыть">
          <CloseOutlined fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}

          {!receipt && (
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontWeight: 600 }}>
                Поставщик *
              </Typography>
              <TextField
                select
                fullWidth
                size="small"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value === "" ? "" : Number(e.target.value))}
                SelectProps={{ displayEmpty: true }}
              >
                <MenuItem value="">
                  <em>Выберите поставщика</em>
                </MenuItem>
                {suppliers.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                    {s.payable != null && Number(s.payable) > 0 ? ` · долг ${formatMoney(s.payable)} сом` : ""}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
          )}

          <Box>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontWeight: 600 }}>
              Сумма *
            </Typography>
            <TextField
              fullWidth
              size="small"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputProps={{ inputMode: "decimal", style: { fontWeight: 600, fontSize: "1rem" } }}
              InputProps={{ endAdornment: <Typography variant="body2" color="text.secondary">сом</Typography> }}
              error={amount !== "" && !amountValid}
              helperText={
                limit != null
                  ? receipt
                    ? `Остаток по накладной — ${formatMoney(limit)} сом`
                    : `Задолженность поставщику — ${formatMoney(limit)} сом`
                  : undefined
              }
            />
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontWeight: 600 }}>
              Способ оплаты
            </Typography>
            <SegmentedTabs
              layoutId="supplier-payment-method"
              value={method}
              onChange={setMethod}
              tabs={METHODS.map((m) => ({ key: m, label: SUPPLIER_PAYMENT_METHOD_LABEL[m] }))}
            />
          </Box>

          {needsCashless && (
            <CashlessMethodSelect
              methods={cashless.methods}
              value={cashlessMethodId}
              onChange={setCashlessMethodId}
              loading={cashless.isLoading}
              loadFailed={cashless.isError}
              error={cashlessMethodId === "" && cashless.isRequired}
              label="Способ безнала *"
            />
          )}

          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontWeight: 600 }}>
                Дата
              </Typography>
              <CustomDatePicker value={paidAt} onChange={(v) => setPaidAt(v as Dayjs | null)} slotProps={{ textField: { size: "small", fullWidth: true } }} />
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontWeight: 600 }}>
                Документ
              </Typography>
              <TextField fullWidth size="small" value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} placeholder="№ платёжки" />
            </Box>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontWeight: 600 }}>
              Комментарий
            </Typography>
            <TextField fullWidth size="small" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например: остаток по накладной" />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1, flexDirection: { xs: "column-reverse", sm: "row" }, gap: 1, "& > :not(:first-of-type)": { ml: 0 } }}>
        <Button variant="outlined" color="inherit" onClick={onClose} disabled={saving} fullWidth={fullScreen} sx={{ borderColor: "divider" }}>
          Отмена
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!isValid || saving}
          fullWidth={fullScreen}
          startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <CheckCircleOutlined />}
        >
          Провести оплату
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SupplierPaymentDialog;
