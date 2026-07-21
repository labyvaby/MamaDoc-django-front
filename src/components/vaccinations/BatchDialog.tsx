import React from "react";
import {
  Alert,
  Autocomplete,
  Dialog,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";

import { AppButton, CustomDatePicker } from "../ui";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { usePermissions } from "../../hooks/usePermissions";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import {
  createBatch,
  getVaccines,
  updateBatch,
  VACCINE_PRODUCT_CATEGORY,
  type CreateBatchPayload,
  type UpdateBatchPayload,
  type VaccineBatch,
} from "../../api/vaccinations";
import { getProducts, type DjangoProduct } from "../../api/warehouse";

type BatchDialogProps = {
  open: boolean;
  onClose: () => void;
  /** null — создание, иначе редактирование. */
  batch: VaccineBatch | null;
};

const BatchDialog: React.FC<BatchDialogProps> = ({ open, onClose, batch }) => {
  const orgId = useApiOrgId();
  const { activeBranch } = usePermissions();
  const branchId = activeBranch?.id ?? null;
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);

  const isEdit = batch != null;

  const [vaccineId, setVaccineId] = React.useState<number | "">("");
  const [product, setProduct] = React.useState<DjangoProduct | null>(null);
  const [batchNumber, setBatchNumber] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState<Dayjs | null>(null);
  const [quantityInitial, setQuantityInitial] = React.useState("");
  const [receivedAt, setReceivedAt] = React.useState<Dayjs | null>(dayjs());
  const [costPrice, setCostPrice] = React.useState("");
  const [supplier, setSupplier] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const vaccinesQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.vaccines({ orgId, picker: "batch" }),
    queryFn: ({ signal }) => getVaccines({ organizationId: orgId }, signal),
    enabled: open && !isEdit,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  // Только товары категории «Вакцины» — партию нельзя завести на произвольный товар.
  const productsQuery = useQuery({
    queryKey: ["django", "warehouse", "products", "vaccination-batch-picker", VACCINE_PRODUCT_CATEGORY],
    queryFn: ({ signal }) =>
      getProducts(signal, { organizationId: orgId, category: VACCINE_PRODUCT_CATEGORY }),
    enabled: open,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  React.useEffect(() => {
    if (!open) return;
    setVaccineId(batch?.vaccineId ?? "");
    setProduct(null);
    setBatchNumber(batch?.batchNumber ?? "");
    setExpiresAt(batch?.expiresAt ? dayjs(batch.expiresAt) : null);
    setQuantityInitial(batch ? String(batch.quantityInitial) : "");
    setReceivedAt(batch?.receivedAt ? dayjs(batch.receivedAt) : dayjs());
    setCostPrice(batch?.costPrice ? String(parseFloat(batch.costPrice)) : "");
    setSupplier(batch?.supplier ?? "");
    setNotes(batch?.notes ?? "");
    setError(null);
  }, [open, batch]);

  // Подставить товар в автокомплит, когда список загрузился (edit по productId).
  React.useEffect(() => {
    if (!open || !isEdit || batch?.productId == null) return;
    const found = (productsQuery.data ?? []).find((p) => p.id === batch.productId);
    if (found) setProduct(found);
  }, [open, isEdit, batch?.productId, productsQuery.data]);

  const mutation = useMutation({
    mutationFn: () => {
      const costStr = costPrice.trim() === "" ? undefined : costPrice.trim();
      if (isEdit) {
        const payload: UpdateBatchPayload = {
          productId: product?.id ?? null,
          batchNumber: batchNumber.trim(),
          expiresAt: expiresAt ? expiresAt.format("YYYY-MM-DD") : undefined,
          quantityInitial: Number(quantityInitial) || 0,
          receivedAt: receivedAt ? receivedAt.format("YYYY-MM-DD") : undefined,
          costPrice: costStr,
          supplier: supplier.trim() || undefined,
          notes: notes.trim() || undefined,
        };
        return updateBatch(batch!.id, payload, orgId);
      }
      const payload: CreateBatchPayload = {
        branchId: branchId!,
        vaccineId: vaccineId as number,
        productId: product?.id ?? undefined,
        batchNumber: batchNumber.trim(),
        expiresAt: expiresAt!.format("YYYY-MM-DD"),
        quantityInitial: Number(quantityInitial) || 0,
        receivedAt: receivedAt ? receivedAt.format("YYYY-MM-DD") : undefined,
        costPrice: costStr,
        supplier: supplier.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      return createBatch(payload, orgId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.vaccinations.all });
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Не удалось сохранить партию"),
  });

  const valid =
    (isEdit || (branchId != null && vaccineId !== "")) &&
    batchNumber.trim() !== "" &&
    expiresAt != null &&
    Number(quantityInitial) > 0;

  return (
    <Dialog open={open} onClose={mutation.isPending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{isEdit ? "Изменить партию" : "Приход партии"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {branchId == null && !isEdit && (
            <Alert severity="warning">Не выбран активный филиал — приход недоступен.</Alert>
          )}

          {isEdit ? (
            <TextField label="Вакцина" size="small" fullWidth disabled value={batch!.vaccineName} />
          ) : (
            <TextField
              select
              label="Вакцина *"
              size="small"
              fullWidth
              value={vaccineId === "" ? "" : String(vaccineId)}
              onChange={(e) => setVaccineId(e.target.value === "" ? "" : Number(e.target.value))}
            >
              {(vaccinesQuery.data ?? []).map((v) => (
                <MenuItem key={v.id} value={String(v.id)}>
                  {v.name}
                </MenuItem>
              ))}
            </TextField>
          )}

          <Autocomplete
            options={productsQuery.data ?? []}
            value={product}
            onChange={(_, v) => setProduct(v)}
            getOptionLabel={(p) => p.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            loading={productsQuery.isLoading}
            noOptionsText="Товары не найдены"
            renderInput={(params) => (
              <TextField {...params} label="Товар склада (вакцина)" size="small" />
            )}
          />
          {product == null && (
            <Alert severity="warning" sx={{ py: 0.25 }}>
              Без товара склада прививка не спишет остаток и окажется бесплатной (не попадёт в счёт).
            </Alert>
          )}

          <TextField
            label="Номер партии *"
            size="small"
            fullWidth
            value={batchNumber}
            onChange={(e) => setBatchNumber(e.target.value)}
          />
          <Stack direction="row" spacing={2}>
            <CustomDatePicker
              label="Годен до *"
              value={expiresAt}
              onChange={(v) => setExpiresAt(v as Dayjs | null)}
              format="DD.MM.YYYY"
              slotProps={{ textField: { size: "small", fullWidth: true } }}
            />
            <TextField
              label="Кол-во доз *"
              size="small"
              fullWidth
              value={quantityInitial}
              onChange={(e) => setQuantityInitial(e.target.value.replace(/[^\d]/g, ""))}
              inputProps={{ inputMode: "numeric" }}
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <CustomDatePicker
              label="Поступила"
              value={receivedAt}
              onChange={(v) => setReceivedAt(v as Dayjs | null)}
              format="DD.MM.YYYY"
              maxDate={dayjs()}
              slotProps={{ textField: { size: "small", fullWidth: true } }}
            />
            <TextField
              label="Закуп. цена"
              size="small"
              fullWidth
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value.replace(/[^\d.]/g, ""))}
              inputProps={{ inputMode: "decimal" }}
              InputProps={{ endAdornment: <InputAdornment position="end">сом</InputAdornment> }}
            />
          </Stack>
          <TextField
            label="Поставщик"
            size="small"
            fullWidth
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
          />
          <TextField
            label="Заметка"
            size="small"
            fullWidth
            multiline
            minRows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <Stack direction="row" spacing={1.5} sx={{ px: 3, pb: 2, pt: 1, justifyContent: "flex-end" }}>
        <AppButton variant="outlined" onClick={onClose} disabled={mutation.isPending}>
          Отмена
        </AppButton>
        <AppButton variant="contained" onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
          Сохранить
        </AppButton>
      </Stack>
    </Dialog>
  );
};

export default BatchDialog;
