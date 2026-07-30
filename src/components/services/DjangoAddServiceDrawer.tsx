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
  createService,
  relatedProductsPayload,
  SERVICE_CATEGORIES_ENABLED,
  SERVICE_CATEGORY_LABELS,
  SERVICE_CATEGORY_OPTIONS,
  SERVICE_RELATED_PRODUCT_ENABLED,
  uploadServiceImage,
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
  onCreated?: () => void;
};

const MotionStack = motion(Stack);
const MotionBox = motion(Box);

// ── черновик формы (localStorage) ────────────────────────────────────────────
// Защита от случайной потери введённых данных при закрытии дровера (крестик,
// клик по фону, Esc). Фото и состав расходников не сохраняем: фото (File) не
// сериализуется, а состав расходников зависит от асинхронно загруженного
// списка товаров склада — восстановление рискует показать несуществующие
// связи. Филиалы храним по id, а не объектами — список филиалов сам грузится
// асинхронно.

const DRAFT_STORAGE_KEY = "mamadoc:services:add-draft";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // старше суток — считаем неактуальным

type ServiceAddDraft = {
  savedAt: number;
  name: string;
  price: string;
  durationMinutes: string;
  category: ServiceCategory | "";
  description: string;
  isActive: boolean;
  selectedBranchIds: number[];
};

function isDraftEmpty(d: Omit<ServiceAddDraft, "savedAt">): boolean {
  return (
    !d.name.trim() &&
    !d.price &&
    d.durationMinutes === "30" &&
    !d.category &&
    !d.description.trim() &&
    d.isActive === true &&
    d.selectedBranchIds.length === 0
  );
}

const DjangoAddServiceDrawer: React.FC<Props> = ({ open, onClose, onCreated }) => {
  const { t } = useT("services");
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const { activeMembership, activeBranch } = usePermissions();
  const orgId = useApiOrgId();

  const availableBranches: RbacBranch[] = React.useMemo(
    () => activeMembership?.branches ?? [],
    [activeMembership],
  );

  const [name, setName] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [durationMinutes, setDurationMinutes] = React.useState("30");
  const [category, setCategory] = React.useState<ServiceCategory | "">("");
  const [description, setDescription] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
  const [selectedBranches, setSelectedBranches] = React.useState<RbacBranch[]>([]);
  const [products, setProducts] = React.useState<DjangoProduct[]>([]);
  const [productsLoading, setProductsLoading] = React.useState(false);
  const [relatedProducts, setRelatedProducts] = React.useState<RelatedProductRow[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [draftRestored, setDraftRestored] = React.useState(false);

  const draftRef = React.useRef<ServiceAddDraft | null>(null);

  React.useEffect(() => {
    if (!open || !SERVICE_RELATED_PRODUCT_ENABLED) return;
    const ctrl = new AbortController();
    setProductsLoading(true);
    getProducts(ctrl.signal, { organizationId: orgId })
      .then((list) => {
        if (ctrl.signal.aborted) return;
        setProducts(list.filter((p) => p.isActive));
      })
      .catch(() => {})
      .finally(() => {
        if (!ctrl.signal.aborted) setProductsLoading(false);
      });
    return () => ctrl.abort();
  }, [open, orgId]);

  // ── восстановление черновика (простые поля) ─────────────────────────────
  React.useEffect(() => {
    if (!open) return;
    const draft = readFormDraft<ServiceAddDraft>(DRAFT_STORAGE_KEY, DRAFT_TTL_MS);
    draftRef.current = draft;
    if (draft) {
      setName(draft.name);
      setPrice(draft.price);
      setDurationMinutes(draft.durationMinutes);
      setCategory(draft.category);
      setDescription(draft.description);
      setIsActive(draft.isActive);
      setDraftRestored(true);
    } else {
      setDraftRestored(false);
    }
  }, [open]);

  // Pre-select activeBranch when drawer opens (not all branches), либо
  // восстанавливаем филиалы из черновика, если он был.
  React.useEffect(() => {
    if (!open) {
      setSelectedBranches([]);
      return;
    }
    const draftIds = draftRef.current?.selectedBranchIds;
    if (draftIds && draftIds.length > 0) {
      setSelectedBranches(availableBranches.filter((b) => draftIds.includes(b.id)));
      return;
    }
    const preselected = activeBranch
      ? availableBranches.filter((b) => b.id === activeBranch.id)
      : [];
    setSelectedBranches(preselected);
  }, [open, activeBranch, availableBranches]);

  // ── сохранение черновика в localStorage (защита от случайного закрытия) ──
  // flushDraftRef всегда указывает на актуальный снэпшот полей — нужен, чтобы
  // при закрытии до истечения debounce (быстрый ввод + сразу закрыть) успеть
  // синхронно записать черновик, а не потерять его вместе с отменённым таймером.
  const flushDraftRef = React.useRef<() => void>(() => {});
  flushDraftRef.current = () => {
    const draft: Omit<ServiceAddDraft, "savedAt"> = {
      name,
      price,
      durationMinutes,
      category,
      description,
      isActive,
      selectedBranchIds: selectedBranches.map((b) => b.id),
    };
    if (isDraftEmpty(draft)) {
      clearFormDraft(DRAFT_STORAGE_KEY);
    } else {
      writeFormDraft(DRAFT_STORAGE_KEY, draft);
    }
  };

  React.useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => flushDraftRef.current(), 400);
    return () => clearTimeout(id);
  }, [open, name, price, durationMinutes, category, description, isActive, selectedBranches]);

  const handleClose = () => {
    flushDraftRef.current();
    onClose();
  };

  const handleDiscardDraft = () => {
    clearFormDraft(DRAFT_STORAGE_KEY);
    draftRef.current = null;
    setName("");
    setPrice("");
    setDurationMinutes("30");
    setCategory("");
    setDescription("");
    setIsActive(true);
    setSelectedBranches(
      activeBranch ? availableBranches.filter((b) => b.id === activeBranch.id) : [],
    );
    setDraftRestored(false);
  };

  React.useEffect(() => {
    if (!open) {
      setName("");
      setPrice("");
      setDurationMinutes("30");
      setCategory("");
      setDescription("");
      setIsActive(true);
      setPhotoFile(null);
      setPhotoPreview(null);
      setSelectedBranches([]);
      setRelatedProducts([]);
      setBusy(false);
      setTouched(false);
      setSubmitError(null);
      setDraftRestored(false);
    }
  }, [open]);

  const onPickPhoto = React.useCallback(async (f: File | null) => {
    setPhotoFile(f);
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
      setPhotoPreview(null);
    }
  }, []);

  const handleSubmit = async () => {
    setTouched(true);
    const priceNum = Number(price);
    const durNum = Number(durationMinutes);
    if (!name.trim() || !price || !Number.isFinite(priceNum) || priceNum <= 0) {
      notify?.({ type: "error", message: t("add.validationRequired") });
      return;
    }
    // Количество расходника валидируем до запроса: бэк на ≤ 0 отвечает 400 и
    // откатывает PATCH целиком — вместе с названием и ценой.
    if (hasInvalidQuantity(relatedProducts)) {
      notify?.({
        type: "error",
        message: t("add.quantityError"),
      });
      return;
    }

    let effectiveBranchIds: number[];
    if (selectedBranches.length > 0) {
      effectiveBranchIds = selectedBranches.map((b) => b.id);
    } else if (activeBranch && availableBranches.some((b) => b.id === activeBranch.id)) {
      effectiveBranchIds = [activeBranch.id];
    } else {
      notify?.({ type: "error", message: t("add.branchRequired") });
      return;
    }

    setBusy(true);
    setSubmitError(null);
    try {
      const service = await createService({
        name: name.trim(),
        description: description.trim(),
        durationMinutes: durNum > 0 ? durNum : 30,
        basePrice: String(priceNum),
        isActive,
        branchIds: effectiveBranchIds,
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
        try {
          await uploadServiceImage(service.id, photoFile);
        } catch {
          // image upload failure is non-fatal
        }
      }
      clearFormDraft(DRAFT_STORAGE_KEY);
      draftRef.current = null;
      notify?.({ type: "success", message: t("add.created") });
      // Список услуг формы приёма кэшируется на 10 минут — обновляем,
      // чтобы новая услуга сразу была доступна при создании приёма.
      void queryClient.invalidateQueries({
        queryKey: ["django", "appointments", "form-data"],
      });
      onCreated?.();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("add.createError");
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
  const hasEffectiveBranch = selectedBranches.length > 0 || (!!activeBranch && availableBranches.some((b) => b.id === activeBranch.id));
  const submitDisabled = !name.trim() || !price || Number(price) <= 0 || noBranches;
  const nameError = touched && !name.trim();
  const priceError = touched && (!price || Number(price) <= 0);
  const branchError = touched && !hasEffectiveBranch;
  const nameValid = !!name.trim();
  const priceValid = !!price && Number(price) > 0;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : handleClose}
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
          <Typography variant="h6">{t("add.title")}</Typography>
          <Stack direction="row" alignItems="center" gap={0.5}>
            {draftRestored && (
              <Tooltip title={`${t("form.draftRestored")} — ${t("form.draftDiscard").toLowerCase()}?`}>
                <IconButton onClick={handleDiscardDraft} aria-label={t("form.draftDiscard")}>
                  <RestoreOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <IconButton onClick={busy ? undefined : handleClose} aria-label={t("common.close")}>
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

            {/* ── Фото + название ── */}
            <MotionBox variants={cascadeItem}>
              <ServicePhotoUploader
                photoFile={photoFile}
                photoPreview={photoPreview}
                onPickPhoto={onPickPhoto}
                inputId="django-add-service-photo"
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
                    {t("form.branchesLabel")}
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
                          placeholder={
                            selectedBranches.length === 0
                              ? activeBranch
                                ? t("form.branchesPlaceholderDefault", { branch: activeBranch.name })
                                : t("form.branchesPlaceholderEmpty")
                              : ""
                          }
                          error={branchError}
                          helperText={branchError ? t("form.branchesError") : ""}
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
                      onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
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
          <Button onClick={handleClose} disabled={busy}>
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

export default DjangoAddServiceDrawer;
