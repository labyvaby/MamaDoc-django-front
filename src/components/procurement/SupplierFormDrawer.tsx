import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Drawer,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";

import { getErrorMessage } from "../../api/client";
import { createSupplier, updateSupplier, type ProcurementScope, type ProcurementSupplier } from "../../api/procurement";
import { djangoQueryKeys } from "../../api/queryKeys";

const CURRENCIES = ["KGS", "USD", "RUB", "KZT", "EUR", "CNY"];

export interface SupplierFormDrawerProps {
  open: boolean;
  onClose: () => void;
  onSaved?: (supplier: ProcurementSupplier) => void;
  scope: ProcurementScope;
  /** null — создание. */
  supplier: ProcurementSupplier | null;
}

/** Карточка поставщика: реквизиты, контакт, условия оплаты, валюта закупа. */
export const SupplierFormDrawer: React.FC<SupplierFormDrawerProps> = ({ open, onClose, onSaved, scope, supplier }) => {
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState({
    name: "",
    taxId: "",
    phone: "",
    email: "",
    contactPerson: "",
    paymentTerms: "",
    defaultCurrency: "KGS",
    comment: "",
    isActive: true,
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({
      name: supplier?.name ?? "",
      taxId: supplier?.taxId ?? "",
      phone: supplier?.phone ?? "",
      email: supplier?.email ?? "",
      contactPerson: supplier?.contactPerson ?? "",
      paymentTerms: supplier?.paymentTerms ?? "",
      defaultCurrency: supplier?.defaultCurrency || "KGS",
      comment: supplier?.comment ?? "",
      isActive: supplier?.isActive ?? true,
    });
  }, [open, supplier]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const isValid = form.name.trim().length > 0;

  const handleSubmit = async () => {
    if (!isValid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        taxId: form.taxId.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        contactPerson: form.contactPerson.trim(),
        paymentTerms: form.paymentTerms.trim(),
        defaultCurrency: form.defaultCurrency,
        comment: form.comment.trim(),
      };
      const saved = supplier
        ? await updateSupplier(supplier.id, { ...payload, isActive: form.isActive }, scope)
        : await createSupplier(payload, scope);
      await queryClient.invalidateQueries({ queryKey: djangoQueryKeys.procurement.all });
      notify?.({ type: "success", message: supplier ? "Поставщик сохранён" : `Поставщик «${saved.name}» добавлен` });
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setError(getErrorMessage(e, "Не удалось сохранить поставщика"));
    } finally {
      setSaving(false);
    }
  };

  const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontWeight: 600, letterSpacing: 0.5 }}>
      {children}
    </Typography>
  );

  return (
    <Drawer anchor="right" open={open} onClose={saving ? undefined : onClose} PaperProps={{ sx: { width: { xs: "100%", sm: 440 }, maxWidth: "100%", display: "flex", flexDirection: "column" } }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
        <Typography variant="h6">{supplier ? "Поставщик" : "Новый поставщик"}</Typography>
        <IconButton onClick={saving ? undefined : onClose} aria-label="Закрыть">
          <CloseOutlined />
        </IconButton>
      </Box>
      <Stack spacing={2} sx={{ p: 2, flex: 1, overflowY: "auto", minHeight: 0 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <Box>
          <Label>Название *</Label>
          <TextField fullWidth size="small" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="ОсОО «Фармимпекс»" autoFocus />
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <Box>
            <Label>ИНН</Label>
            <TextField fullWidth size="small" value={form.taxId} onChange={(e) => set("taxId", e.target.value)} inputProps={{ inputMode: "numeric" }} />
          </Box>
          <Box>
            <Label>Валюта закупа</Label>
            <TextField select fullWidth size="small" value={form.defaultCurrency} onChange={(e) => set("defaultCurrency", e.target.value)}>
              {CURRENCIES.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        </Box>
        <Box>
          <Label>Контактное лицо</Label>
          <TextField fullWidth size="small" value={form.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} />
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <Box>
            <Label>Телефон</Label>
            <TextField fullWidth size="small" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+996 …" inputProps={{ inputMode: "tel" }} />
          </Box>
          <Box>
            <Label>Email</Label>
            <TextField fullWidth size="small" value={form.email} onChange={(e) => set("email", e.target.value)} inputProps={{ inputMode: "email" }} />
          </Box>
        </Box>
        <Box>
          <Label>Условия оплаты</Label>
          <TextField fullWidth size="small" value={form.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} placeholder="30 дней от накладной, предоплата 50%…" />
        </Box>
        <Box>
          <Label>Комментарий</Label>
          <TextField fullWidth size="small" multiline rows={2} value={form.comment} onChange={(e) => set("comment", e.target.value)} />
        </Box>
        {supplier && (
          <FormControlLabel
            control={<Switch checked={form.isActive} onChange={(_, checked) => set("isActive", checked)} />}
            label={<Typography variant="body2">Активен — доступен в новых накладных</Typography>}
          />
        )}
      </Stack>
      <Box sx={{ p: 2, borderTop: 1, borderColor: "divider", display: "flex", gap: 1, justifyContent: "flex-end" }}>
        <Button variant="outlined" color="inherit" onClick={onClose} disabled={saving} sx={{ borderColor: "divider" }}>
          Отмена
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!isValid || saving} startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <CheckCircleOutlined />}>
          Сохранить
        </Button>
      </Box>
    </Drawer>
  );
};

export default SupplierFormDrawer;
