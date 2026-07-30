import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import SellOutlined from "@mui/icons-material/SellOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import AccessTimeOutlined from "@mui/icons-material/AccessTimeOutlined";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import RestoreOutlined from "@mui/icons-material/RestoreOutlined";
import { motion } from "framer-motion";
import { useNotification } from "@refinedev/core";
import { useQueryClient } from "@tanstack/react-query";

import ServicePhotoUploader from "./ServicePhotoUploader";
import RelatedProductsPicker from "./RelatedProductsPicker";
import { hasInvalidQuantity, type RelatedProductRow } from "./relatedProductRows";
import {
  deleteServiceImage,
  relatedProductsPayload,
  SERVICE_CATEGORIES_ENABLED,
  SERVICE_CATEGORY_LABELS,
  SERVICE_CATEGORY_OPTIONS,
  SERVICE_RELATED_PRODUCT_ENABLED,
  updateService,
  uploadServiceImage,
  type Service,
  type ServiceCategory,
} from "../../api/catalog";
import { getProducts, type DjangoProduct } from "../../api/warehouse";
import { usePermissions } from "../../hooks/usePermissions";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import type { RbacBranch } from "../../api/auth";
import { useT } from "../../i18n/VerticalProvider";
import { cascadeContainer, cascadeItem } from "../ui";
import { readFormDraft, writeFormDraft, clearFormDraft } from "../../utility/formDraft";

const toggleTabStyles = (theme: any, color: string) => ({
  minHeight: 32,
  borderRadius: 1,
  textTransform: "none",
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "text.secondary",
  "&.Mui-selected": {
    color: theme.palette.getContrastText(color),
    bgcolor: color,
  },
  transition: "all 0.2s",
});

type Props = {
  open: boolean;
  onClose: () => void;
  record: Service;
  onUpdated?: () => void;
};

const MotionStack = motion(Stack);
const MotionBox = motion(Box);

// ── черновик формы (localStorage) ────────────────────────────────────────────
// Защита от случайной потери введённых правок при закрытии дровера. В отличие
// от формы создания, здесь поля стартуют не пустыми, а из данных услуги —
// поэтому черновик пишется только если текущие значения отличаются от
// исходных, а «Очистить» откатывает к исходным данным услуги, а не к пустой
// форме. Ключ включает id услуги. Фото и состав расходников не сохраняем:
// фото (File) не сериализуется, а состав зависит от асинхронно загруженного
// списка товаров склада.

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // старше суток — считаем неактуальным

type ServiceEditDraft = {
  savedAt: number;
  name: string;
  price: string;
  durationMinutes: string;
  category: ServiceCategory | "";
  description: string;
  isActive: boolean;
  selectedBranchIds: number[];
};

function draftKeyFor(serviceId: number): string {
  return `mamadoc:services:edit-draft:${serviceId}`;
}

function sameIdSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

function sameAsBaseline(
  a: Omit<ServiceEditDraft, "savedAt">,
  b: Omit<ServiceEditDraft, "savedAt">,
): boolean {
  return (
    a.name === b.name &&
    a.price === b.price &&
    a.durationMinutes === b.durationMinutes &&
    a.category === b.category &&
    a.description === b.description &&
    a.isActive === b.isActive &&
    sameIdSet(a.selectedBranchIds, b.selectedBranchIds)
  );
}

const DjangoEditServiceDrawer: React.FC<Props> = ({ open, onClose, record, onUpdated }) => {
  const { t } = useT("services");
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const { activeMembership } = usePermissions();
  const orgId = useApiOrgId();

  const availableBranches: RbacBranch[] = React.useMemo(
    () => activeMembership?.branches ?? [],
    [activeMembership],
  );

  const [name, setName] = React.useState(record.name);
  const [price, setPrice] = React.useState(record.basePrice ?? "");
  const [durationMinutes, setDurationMinutes] = React.useState(String(record.durationMinutes ?? 30));
  const [category, setCategory] = React.useState<ServiceCategory | "">(record.category ?? "");
  const [description, setDescription] = React.useState(record.description ?? "");
  const [isActive, setIsActive] = React.useState(record.isActive ?? true);
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(record.imageUrl ?? null);
  const [removePhoto, setRemovePhoto] = React.useState(false);
  const [selectedBranches, setSelectedBranches] = React.useState<RbacBranch[]>([]);
  const [products, setProducts] = React.useState<DjangoProduct[]>([]);
  const [productsLoading, setProductsLoading] = React.useState(false);
  const [relatedProducts, setRelatedProducts] = React.useState<RelatedProductRow[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [draftRestored, setDraftRestored] = React.useState(false);

  const draftRef = React.useRef<ServiceEditDraft | null>(null);
  const baselineRef = React.useRef<Omit<ServiceEditDraft, "savedAt"> | null>(null);

  // Ключ вместо массива в deps — иначе эффект перезапускается на каждый рефетч
  // услуг. В ключ входят количество, автосписание и платность: правка состава
  // меняет их без смены набора товаров.
  const linkedComposition = record.relatedProducts;
  const linkedCompositionKey = linkedComposition
    .map((p) => `${p.id}:${p.quantity}:${p.autoWriteOff ? 1 : 0}:${p.billable ? 1 : 0}`)
    .join(",");

  // Загружаем товары и подставляем уже привязанные (по record.relatedProducts).
  React.useEffect(() => {
    if (!open || !SERVICE_RELATED_PRODUCT_ENABLED) return;
    const ctrl = new AbortController();
    setProductsLoading(true);
    getProducts(ctrl.signal, { includeInactive: true, organizationId: orgId })
      .then((list) => {
        if (ctrl.signal.aborted) return;
        const active = list.filter((p) => p.isActive);
        // Привязанный товар мог быть деактивирован — держим его в опциях,
        // иначе пикер покажет пусто и сохранение молча очистит связь.
        const linkedRows = linkedComposition
          .map((item) => {
            const product = list.find((p) => p.id === item.id);
            return product
              ? {
                  product,
                  quantity: String(item.quantity),
                  autoWriteOff: item.autoWriteOff,
                  billable: item.billable,
                }
              : null;
          })
          .filter((row): row is RelatedProductRow => row !== null);
        const inactiveLinked = linkedRows
          .map((row) => row.product)
          .filter((p) => !p.isActive);
        setProducts(inactiveLinked.length > 0 ? [...inactiveLinked, ...active] : active);
        setRelatedProducts(linkedRows);
      })
      .catch(() => {})
      .finally(() => {
        if (!ctrl.signal.aborted) setProductsLoading(false);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, linkedCompositionKey, orgId]);

  // ── восстановление простых полей + чтение черновика (по id услуги) ───────
  React.useEffect(() => {
    if (!open) return;
    const draft = readFormDraft<ServiceEditDraft>(draftKeyFor(record.id), DRAFT_TTL_MS);
    draftRef.current = draft;
    const base: Omit<ServiceEditDraft, "savedAt" | "selectedBranchIds"> = {
      name: record.name,
      price: record.basePrice ?? "",
      durationMinutes: String(record.durationMinutes ?? 30),
      category: record.category ?? "",
      description: record.description ?? "",
      isActive: record.isActive ?? true,
    };
    const next = draft ?? base;
    setName(next.name);
    setPrice(next.price);
    setDurationMinutes(next.durationMinutes);
    setCategory(next.category);
    setDescription(next.description);
    setIsActive(next.isActive);
    setDraftRestored(Boolean(draft));
    // selectedBranchIds baseline заполняется в эффекте синхронизации филиалов —
    // он выполняется следом и знает актуальный availableBranches.
    baselineRef.current = { ...base, selectedBranchIds: [] };
    // record — сложный объект, перезапуск по id/open, не по каждому рефетчу.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record.id]);

  // Sync selectedBranches from record.branches (или из черновика) when drawer opens.
  React.useEffect(() => {
    if (!open) return;
    const recordBranchIds = new Set(
      Array.isArray(record.branches) ? record.branches.map((b) => b.id) : [],
    );
    const baselineIds = availableBranches
      .filter((b) => recordBranchIds.has(b.id))
      .map((b) => b.id);
    if (baselineRef.current) {
      baselineRef.current = { ...baselineRef.current, selectedBranchIds: baselineIds };
    }
    const draftIds = draftRef.current?.selectedBranchIds;
    const idsToUse = draftIds ?? baselineIds;
    setSelectedBranches(availableBranches.filter((b) => idsToUse.includes(b.id)));
  }, [open, record.branches, availableBranches]);

  // ── сохранение черновика в localStorage (защита от случайного закрытия) ──
  React.useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => {
      const current: Omit<ServiceEditDraft, "savedAt"> = {
        name,
        price,
        durationMinutes,
        category,
        description,
        isActive,
        selectedBranchIds: selectedBranches.map((b) => b.id),
      };
      const key = draftKeyFor(record.id);
      if (baselineRef.current && sameAsBaseline(current, baselineRef.current)) {
        clearFormDraft(key);
      } else {
        writeFormDraft(key, current);
      }
    }, 400);
    return () => clearTimeout(id);
  }, [open, record.id, name, price, durationMinutes, category, description, isActive, selectedBranches]);

  const handleDiscardDraft = () => {
    clearFormDraft(draftKeyFor(record.id));
    draftRef.current = null;
    const b = baselineRef.current;
    if (b) {
      setName(b.name);
      setPrice(b.price);
      setDurationMinutes(b.durationMinutes);
      setCategory(b.category);
      setDescription(b.description);
      setIsActive(b.isActive);
      setSelectedBranches(availableBranches.filter((br) => b.selectedBranchIds.includes(br.id)));
    }
    setDraftRestored(false);
  };

  React.useEffect(() => {
    if (!open) {
      setName(record.name);
      setPrice(record.basePrice ?? "");
      setDurationMinutes(String(record.durationMinutes ?? 30));
      setCategory(record.category ?? "");
      setDescription(record.description ?? "");
      setIsActive(record.isActive ?? true);
      setPhotoFile(null);
      setPhotoPreview(record.imageUrl ?? null);
      setRemovePhoto(false);
      setSelectedBranches([]);
      setRelatedProducts([]);
      setBusy(false);
      setTouched(false);
      setSubmitError(null);
      setDraftRestored(false);
    }
  }, [open, record]);

  const onPickPhoto = React.useCallback(async (f: File | null) => {
    setPhotoFile(f);
    setRemovePhoto(false);
    if (f) {
      try {
        const url = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result || ""));
          r.onerror = reject;
          r.readAsDataURL(f);
        });
        setPhotoPreview(url);
      } catch {
        setPhotoPreview(null);
      }
    } else {
      setRemovePhoto(true);
      setPhotoPreview(null);
    }
  }, []);

  const handleSubmit = async () => {
    setTouched(true);
    const priceNum = Number(price);
    const durNum = Number(durationMinutes);
    if (!name.trim() || !price || !Number.isFinite(priceNum) || priceNum <= 0) {
      notify?.({ type: "error", message: t("edit.validationRequired") });
      return;
    }
    if (selectedBranches.length === 0) {
      notify?.({ type: "error", message: t("edit.branchRequired") });
      return;
    }
    // Количество расходника валидируем до запроса: бэк на ≤ 0 отвечает 400 и
    // откатывает PATCH целиком — вместе с названием и ценой.
    if (hasInvalidQuantity(relatedProducts)) {
      notify?.({
        type: "error",
        message: t("edit.quantityError"),
      });
      return;
    }
    setBusy(true);
    setSubmitError(null);
    try {
      await updateService(record.id, {
        name: name.trim(),
        description: description.trim(),
        durationMinutes: durNum > 0 ? durNum : 30,
        basePrice: String(priceNum),
        isActive,
        branchIds: selectedBranches.map((b) => b.id),
        ...(SERVICE_CATEGORIES_ENABLED ? { category: category || null } : {}),
        ...relatedProductsPayload(
          relatedProducts.map((row) => ({
            productId: row.product.id,
            quantity: row.quantity,
            autoWriteOff: row.autoWriteOff,
            billable: row.billable,
          })),
        ),
      });
      if (photoFile) {
        await uploadServiceImage(record.id, photoFile);
      } else if (removePhoto && record.imageUrl) {
        await deleteServiceImage(record.id);
      }
      clearFormDraft(draftKeyFor(record.id));
      draftRef.current = null;
      notify?.({ type: "success", message: t("edit.updated") });
      // Список услуг формы приёма кэшируется на 10 минут — обновляем,
      // чтобы правки (название, цена, филиалы, активность) сразу попали в форму.
      void queryClient.invalidateQueries({
        queryKey: ["django", "appointments", "form-data"],
      });
      onUpdated?.();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("edit.updateError");
      setSubmitError(msg);
    } finally {
      setBusy(false);
    }
  };

  const submitOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const noBranches = availableBranches.length === 0;
  const submitDisabled = !name.trim() || !price || Number(price) <= 0 || selectedBranches.length === 0;
  const nameError = touched && !name.trim();
  const priceError = touched && (!price || Number(price) <= 0);
  const branchError = touched && selectedBranches.length === 0;
  const nameValid = !!name.trim();
  const priceValid = !!price && Number(price) > 0;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : onClose}
      PaperProps={{
        sx: {
          width: { xs: 320, sm: 480, md: 520 },
          maxWidth: "100vw",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <Box sx={{ width: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" px={2} py={1.5}>
          <Typography variant="h6">{t("edit.title")}</Typography>
          <Stack direction="row" alignItems="center" gap={0.5}>
            {draftRestored && (
              <Tooltip title={`${t("form.draftRestored")} — ${t("form.draftDiscard").toLowerCase()}?`}>
                <IconButton onClick={handleDiscardDraft} aria-label={t("form.draftDiscard")}>
                  <RestoreOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <IconButton onClick={busy ? undefined : onClose} aria-label={t("common.close")}>
              <CloseOutlined />
            </IconButton>
          </Stack>
        </Stack>
        <Divider />

        {/* Body */}
        <Box
          px={2}
          py={2}
          sx={{
            flex: 1,
            overflowY: "auto",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          <MotionStack spacing={2.5} variants={cascadeContainer} initial="hidden" animate="show">
            {submitError && (
              <Alert severity="error" onClose={() => setSubmitError(null)}>
                {submitError}
              </Alert>
            )}

            {record.hasHiddenBranches && (
              <Alert severity="info">
                {t("edit.hiddenBranchesWarning")}
              </Alert>
            )}

            {/* ── Фото + название ── */}
            <MotionBox variants={cascadeItem}>
              <ServicePhotoUploader
                photoFile={photoFile}
                photoPreview={photoPreview}
                onPickPhoto={onPickPhoto}
                inputId="django-edit-service-photo"
              />
            </MotionBox>

            <MotionBox variants={cascadeItem}>
              <Stack spacing={0.5}>
                <Typography variant="body2" color="text.secondary" fontWeight={600}>
                  {t("form.nameLabel")}
                </Typography>
                <TextField
                  placeholder={t("form.namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={submitOnEnter}
                  fullWidth
                  size="small"
                  autoFocus
                  error={nameError}
                  helperText={nameError ? t("form.nameRequired") : ""}
                  disabled={busy}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SellOutlined fontSize="small" color="disabled" />
                      </InputAdornment>
                    ),
                    endAdornment: nameValid ? (
                      <InputAdornment position="end">
                        <CheckCircleOutlined fontSize="small" color="success" />
                      </InputAdornment>
                    ) : undefined,
                  }}
                />
              </Stack>
            </MotionBox>

            {/* ── Стоимость и филиалы ── */}
            <MotionBox variants={cascadeItem}>
              <Stack spacing={1.5}>
                <Divider />
                <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                  {t("form.sectionPricing")}
                </Typography>

                <Stack spacing={0.5}>
                  <Typography variant="body2" color="text.secondary" fontWeight={600}>
                    {t("form.branchesLabelRequired")}
                  </Typography>
                  {noBranches ? (
                    <Alert severity="warning">{t("form.noBranches")}</Alert>
                  ) : (
                    <Autocomplete
                      multiple
                      size="small"
                      options={availableBranches}
                      getOptionLabel={(o) => o.name}
                      value={selectedBranches}
                      onChange={(_, val) => setSelectedBranches(val)}
                      disabled={busy}
                      renderTags={(val, getTagProps) =>
                        val.map((opt, idx) => (
                          <Chip
                            {...getTagProps({ index: idx })}
                            key={opt.id}
                            label={opt.name}
                            size="small"
                          />
                        ))
                      }
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          placeholder={selectedBranches.length === 0 ? t("form.branchesPlaceholderSelect") : ""}
                          error={branchError}
                          helperText={branchError ? t("form.branchesErrorRequired") : ""}
                        />
                      )}
                    />
                  )}
                </Stack>

                <Stack direction="row" spacing={1.5}>
                  <Stack spacing={0.5} sx={{ flex: 1 }}>
                    <Typography variant="body2" color="text.secondary" fontWeight={600}>
                      {t("form.priceLabel")}
                    </Typography>
                    <TextField
                      type="text"
                      inputMode="numeric"
                      value={price}
                      onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
                      onKeyDown={submitOnEnter}
                      size="small"
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <PaymentsOutlined fontSize="small" color="disabled" />
                          </InputAdornment>
                        ),
                        endAdornment: (
                          <InputAdornment position="end">
                            <Stack direction="row" alignItems="center" spacing={0.5}>
                              <Typography variant="body2" color="text.secondary">
                                {t("form.priceCurrency")}
                              </Typography>
                              {priceValid && <CheckCircleOutlined fontSize="small" color="success" />}
                            </Stack>
                          </InputAdornment>
                        ),
                      }}
                      fullWidth
                      placeholder={t("form.pricePlaceholder")}
                      error={priceError}
                      helperText={priceError ? t("form.priceError") : ""}
                      disabled={busy}
                    />
                  </Stack>
                  <Stack spacing={0.5} sx={{ flex: 1 }}>
                    <Typography variant="body2" color="text.secondary" fontWeight={600}>
                      {t("form.durationLabel")}
                    </Typography>
                    <TextField
                      type="text"
                      inputMode="numeric"
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(e.target.value.replace(/[^\d]/g, ""))}
                      onKeyDown={submitOnEnter}
                      size="small"
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <AccessTimeOutlined fontSize="small" color="disabled" />
                          </InputAdornment>
                        ),
                        endAdornment: <InputAdornment position="end">{t("form.durationUnit")}</InputAdornment>,
                      }}
                      fullWidth
                      placeholder={t("form.durationPlaceholder")}
                      disabled={busy}
                    />
                  </Stack>
                </Stack>

                {SERVICE_CATEGORIES_ENABLED && (
                  <Stack spacing={0.5}>
                    <Typography variant="body2" color="text.secondary" fontWeight={600}>
                      {t("form.categoryLabel")}
                    </Typography>
                    <TextField
                      select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as ServiceCategory | "")}
                      fullWidth
                      size="small"
                      disabled={busy}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <CategoryOutlined fontSize="small" color="disabled" />
                          </InputAdornment>
                        ),
                      }}
                    >
                      <MenuItem value="">{t("form.categoryNone")}</MenuItem>
                      {SERVICE_CATEGORY_OPTIONS.map((c) => (
                        <MenuItem key={c} value={c}>
                          {SERVICE_CATEGORY_LABELS[c]}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Stack>
                )}
              </Stack>
            </MotionBox>

            {/* ── Расходники ── */}
            {SERVICE_RELATED_PRODUCT_ENABLED && (
              <MotionBox variants={cascadeItem}>
                <Stack spacing={1.5}>
                  <Divider />
                  <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                    {t("form.sectionComposition")}
                  </Typography>
                  <RelatedProductsPicker
                    options={products}
                    loading={productsLoading}
                    value={relatedProducts}
                    onChange={setRelatedProducts}
                    disabled={busy}
                    showErrors={touched}
                  />
                </Stack>
              </MotionBox>
            )}

            {/* ── Дополнительно ── */}
            <MotionBox variants={cascadeItem}>
              <Stack spacing={1.5}>
                <Divider />
                <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                  {t("form.sectionExtra")}
                </Typography>

                <Stack spacing={0.5}>
                  <Typography variant="body2" color="text.secondary" fontWeight={600}>
                    {t("form.descriptionLabel")}
                  </Typography>
                  <TextField
                    placeholder={t("form.descriptionPlaceholder")}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    fullWidth
                    multiline
                    rows={3}
                    disabled={busy}
                  />
                </Stack>

                <Paper elevation={0} variant="outlined" sx={{ p: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Typography variant="body2">{t("form.statusLabel")}</Typography>
                  <Tabs
                    value={isActive ? 0 : 1}
                    onChange={(_, v) => setIsActive(v === 0)}
                    sx={{ minHeight: 32 }}
                    TabIndicatorProps={{ style: { display: "none" } }}
                  >
                    <Tab label={t("common.active")} sx={(theme) => ({ ...toggleTabStyles(theme, theme.palette.success.main), minHeight: 32, py: 0, px: 2 })} />
                    <Tab label={t("common.inactive")} sx={(theme) => ({ ...toggleTabStyles(theme, theme.palette.action.disabledBackground), minHeight: 32, py: 0, px: 2, "&.Mui-selected": { bgcolor: "action.selected", color: "text.primary" } })} />
                  </Tabs>
                </Paper>
              </Stack>
            </MotionBox>
          </MotionStack>
        </Box>

        {/* Footer */}
        <Divider />
        <Box px={2} py={1.5} display="flex" justifyContent="flex-end" gap={1.5}>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="contained" onClick={handleSubmit} disabled={busy || submitDisabled}>
            {busy ? (
              <Stack direction="row" alignItems="center" spacing={1}>
                <CircularProgress size={18} />
                <span>{t("common.saving")}</span>
              </Stack>
            ) : (
              t("common.save")
            )}
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
};

export default DjangoEditServiceDrawer;
