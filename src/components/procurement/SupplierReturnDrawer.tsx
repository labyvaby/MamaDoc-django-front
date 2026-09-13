import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import UndoOutlined from "@mui/icons-material/UndoOutlined";

import { getErrorMessage } from "../../api/client";
import { createReturn, type GoodsReceipt, type ProcurementScope, type ProcurementSupplier } from "../../api/procurement";
import { djangoQueryKeys } from "../../api/queryKeys";
import { getProducts, getWarehouses, type DjangoProduct } from "../../api/warehouse";
import { formatMoney } from "./meta";

type ProductOption = { id: number; label: string; unit: string };

interface ReturnLine {
  key: string;
  product: ProductOption | null;
  quantity: string;
  /** Подсказка — сколько пришло по накладной. */
  received?: string;
}

const newLine = (): ReturnLine => ({ key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, product: null, quantity: "" });

const REASONS = ["Брак поставщика", "Пересорт", "Истёк срок годности", "Невыкуп", "Другое"];

export interface SupplierReturnDrawerProps {
  open: boolean;
  onClose: () => void;
  scope: ProcurementScope;
  activeBranchId: number | null;
  suppliers: ProcurementSupplier[];
  /** Возврат по накладной — поставщик, склад и позиции из неё. */
  receipt?: GoodsReceipt | null;
}

/**
 * «Возврат поставщику»: товар снимается со склада по FEFO, долг перед
 * поставщиком уменьшается на себестоимость возвращённого.
 */
export const SupplierReturnDrawer: React.FC<SupplierReturnDrawerProps> = ({ open, onClose, scope, activeBranchId, suppliers, receipt }) => {
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const orgId = scope.organizationId ?? undefined;

  const [supplierId, setSupplierId] = React.useState<number | "">("");
  const [warehouseId, setWarehouseId] = React.useState<number | "">("");
  const [number, setNumber] = React.useState("");
  const [reason, setReason] = React.useState(REASONS[0]);
  const [reasonText, setReasonText] = React.useState("");
  const [lines, setLines] = React.useState<ReturnLine[]>([newLine()]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const productsQuery = useQuery({
    queryKey: ["django", "procurement", "form-products", orgId ?? null, activeBranchId],
    queryFn: ({ signal }) => getProducts(signal, { organizationId: orgId, branchId: activeBranchId ?? undefined }),
    enabled: open && !receipt,
    staleTime: 60_000,
  });
  const warehousesQuery = useQuery({
    queryKey: ["django", "procurement", "form-warehouses", orgId ?? null],
    queryFn: ({ signal }) => getWarehouses(signal, orgId),
    enabled: open,
    staleTime: 60_000,
  });

  const productOptions = React.useMemo<ProductOption[]>(() => {
    if (receipt) return receipt.lines.map((l) => ({ id: l.productId, label: l.productName, unit: l.productUnit || "шт" }));
    return (productsQuery.data ?? []).filter((p: DjangoProduct) => p.isActive).map((p: DjangoProduct) => ({ id: p.id, label: p.name, unit: p.unit || "шт" }));
  }, [receipt, productsQuery.data]);

  React.useEffect(() => {
    if (!open) return;
    setSupplierId(receipt?.supplierId ?? "");
    setWarehouseId(receipt?.warehouseId ?? "");
    setNumber(`ВП-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 90 + 10)}`);
    setReason(REASONS[0]);
    setReasonText("");
    setError(null);
    setLines(
      receipt
        ? receipt.lines.map((l) => ({
            ...newLine(),
            product: { id: l.productId, label: l.productName, unit: l.productUnit || "шт" },
            quantity: "",
            received: l.quantity,
          }))
        : [newLine()],
    );
  }, [open, receipt]);

  const updateLine = (key: string, patch: Partial<ReturnLine>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : [newLine()]));

  const toNumber = (raw: string) => Number(String(raw).replace(",", ".").replace(/\s/g, ""));
  const filled = lines.filter((l) => l.product && toNumber(l.quantity) > 0);
  const isValid = supplierId !== "" && warehouseId !== "" && number.trim() !== "" && filled.length > 0;

  const handleSubmit = async () => {
    if (!isValid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createReturn(
        {
          supplierId: Number(supplierId),
          warehouseId: Number(warehouseId),
          number: number.trim(),
          reason: [reason, reasonText.trim()].filter(Boolean).join(": "),
          goodsReceiptId: receipt?.id ?? null,
          lines: filled.map((l) => ({ productId: l.product!.id, quantity: String(toNumber(l.quantity)) })),
        },
        scope,
      );
      await queryClient.invalidateQueries({ queryKey: djangoQueryKeys.procurement.all });
      notify?.({ type: "success", message: `Возврат ${created.number} оформлен на ${formatMoney(created.totalCost)} сом` });
      onClose();
    } catch (e) {
      setError(getErrorMessage(e, "Не удалось оформить возврат"));
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
    <Drawer anchor="right" open={open} onClose={saving ? undefined : onClose} PaperProps={{ sx: { width: { xs: "100%", sm: 480 }, maxWidth: "100%", display: "flex", flexDirection: "column" } }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
        <Box>
          <Typography variant="h6">Возврат поставщику</Typography>
          <Typography variant="caption" color="text.secondary">
            {receipt ? `По накладной ${receipt.number} · ${receipt.supplierName}` : "Товар снимается со склада, долг перед поставщиком уменьшается"}
          </Typography>
        </Box>
        <IconButton onClick={saving ? undefined : onClose} aria-label="Закрыть">
          <CloseOutlined />
        </IconButton>
      </Box>

      <Stack spacing={2} sx={{ p: 2, flex: 1, overflowY: "auto", minHeight: 0 }}>
        {error && <Alert severity="error">{error}</Alert>}

        {!receipt && (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
            <Box>
              <Label>Поставщик *</Label>
              <TextField select fullWidth size="small" value={supplierId} onChange={(e) => setSupplierId(e.target.value === "" ? "" : Number(e.target.value))} SelectProps={{ displayEmpty: true }}>
                <MenuItem value="">
                  <em>Выберите поставщика</em>
                </MenuItem>
                {suppliers.filter((s) => s.isActive).map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <Box>
              <Label>Склад *</Label>
              <TextField select fullWidth size="small" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value === "" ? "" : Number(e.target.value))} SelectProps={{ displayEmpty: true }}>
                <MenuItem value="">
                  <em>Выберите склад</em>
                </MenuItem>
                {(warehousesQuery.data ?? []).map((w) => (
                  <MenuItem key={w.id} value={w.id}>
                    {w.isLinked ? `${w.name} — филиал: ${w.branchName}` : w.name}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
          </Box>
        )}

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
          <Box>
            <Label>Номер возврата *</Label>
            <TextField fullWidth size="small" value={number} onChange={(e) => setNumber(e.target.value)} />
          </Box>
          <Box>
            <Label>Причина</Label>
            <TextField select fullWidth size="small" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <MenuItem key={r} value={r}>
                  {r}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        </Box>
        <TextField fullWidth size="small" value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Подробности: что именно не так" />

        <Divider />

        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Позиции
        </Typography>
        <Stack spacing={1}>
          {lines.map((line, index) => (
            <Stack key={line.key} direction="row" spacing={1} alignItems="center">
              <Autocomplete<ProductOption, false, false, false>
                options={productOptions}
                value={line.product}
                onChange={(_, value) => updateLine(line.key, { product: value })}
                getOptionLabel={(o) => o.label}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                size="small"
                sx={{ flex: 1, minWidth: 0 }}
                disabled={Boolean(receipt)}
                renderInput={(params) => <TextField {...params} placeholder={`Товар ${index + 1}`} />}
              />
              <TextField
                size="small"
                value={line.quantity}
                onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                placeholder={line.received ? `до ${Number(line.received)}` : "Кол-во"}
                inputProps={{ inputMode: "decimal", style: { textAlign: "right" } }}
                sx={{ width: 110 }}
                InputProps={{ endAdornment: line.product ? <Typography variant="caption" color="text.secondary">{line.product.unit}</Typography> : undefined }}
              />
              {!receipt && (
                <IconButton size="small" onClick={() => removeLine(line.key)} aria-label="Удалить позицию">
                  <DeleteOutlineOutlined fontSize="small" />
                </IconButton>
              )}
            </Stack>
          ))}
        </Stack>
        {!receipt && (
          <Button variant="text" size="small" startIcon={<AddOutlined />} onClick={() => setLines((prev) => [...prev, newLine()])} sx={{ alignSelf: "flex-start" }}>
            Добавить позицию
          </Button>
        )}
        <Typography variant="caption" color="text.secondary">
          Сумма возврата считается по себестоимости партий (FEFO) и появится после проведения.
        </Typography>
      </Stack>

      <Box sx={{ p: 2, borderTop: 1, borderColor: "divider", display: "flex", gap: 1, flexDirection: { xs: "column-reverse", sm: "row" }, justifyContent: "flex-end" }}>
        <Button variant="outlined" color="inherit" onClick={onClose} disabled={saving} sx={{ borderColor: "divider" }}>
          Отмена
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!isValid || saving} startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <UndoOutlined />}>
          Оформить возврат
        </Button>
      </Box>
    </Drawer>
  );
};

export default SupplierReturnDrawer;
