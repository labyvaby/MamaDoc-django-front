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
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { useNotification } from "@refinedev/core";
import { useQueryClient } from "@tanstack/react-query";

import ServicePhotoUploader from "./ServicePhotoUploader";
import {
  updateService,
  uploadServiceImage,
  deleteServiceImage,
  SERVICE_CATEGORIES_ENABLED,
  SERVICE_CATEGORY_LABELS,
  SERVICE_CATEGORY_OPTIONS,
  type Service,
  type ServiceCategory,
} from "../../api/catalog";
import { usePermissions } from "../../hooks/usePermissions";
import type { RbacBranch } from "../../api/auth";

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

const DjangoEditServiceDrawer: React.FC<Props> = ({ open, onClose, record, onUpdated }) => {
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const { activeMembership } = usePermissions();

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
  const [busy, setBusy] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // Sync selectedBranches from record.branches when drawer opens.
  React.useEffect(() => {
    if (open) {
      const recordBranchIds = new Set(
        Array.isArray(record.branches) ? record.branches.map((b) => b.id) : [],
      );
      const preselected = availableBranches.filter((b) => recordBranchIds.has(b.id));
      setSelectedBranches(preselected);
    }
  }, [open, record.branches, availableBranches]);

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
      setBusy(false);
      setTouched(false);
      setSubmitError(null);
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
      notify?.({ type: "error", message: "Заполните название и положительную стоимость услуги" });
      return;
    }
    if (selectedBranches.length === 0) {
      notify?.({ type: "error", message: "Выберите хотя бы один филиал" });
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
      });
      if (photoFile) {
        await uploadServiceImage(record.id, photoFile);
      } else if (removePhoto && record.imageUrl) {
        await deleteServiceImage(record.id);
      }
      notify?.({ type: "success", message: "Услуга обновлена" });
      // Список услуг формы приёма кэшируется на 10 минут — обновляем,
      // чтобы правки (название, цена, филиалы, активность) сразу попали в форму.
      void queryClient.invalidateQueries({
        queryKey: ["django", "appointments", "form-data"],
      });
      onUpdated?.();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось обновить услугу";
      setSubmitError(msg);
    } finally {
      setBusy(false);
    }
  };

  const noBranches = availableBranches.length === 0;
  const submitDisabled = !name.trim() || !price || Number(price) <= 0 || selectedBranches.length === 0;
  const nameError = touched && !name.trim();
  const priceError = touched && (!price || Number(price) <= 0);
  const branchError = touched && selectedBranches.length === 0;

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
          <Typography variant="h6">Редактирование услуги</Typography>
          <IconButton onClick={busy ? undefined : onClose} aria-label="Закрыть">
            <CloseOutlined />
          </IconButton>
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
          <Stack spacing={2.5}>
            {submitError && (
              <Alert severity="error" onClose={() => setSubmitError(null)}>
                {submitError}
              </Alert>
            )}

            {record.hasHiddenBranches && (
              <Alert severity="info">
                Услуга связана с филиалами вне вашего доступа. Некоторые настройки могут быть ограничены.
              </Alert>
            )}

            <ServicePhotoUploader
              photoFile={photoFile}
              photoPreview={photoPreview}
              onPickPhoto={onPickPhoto}
              inputId="django-edit-service-photo"
            />

            {/* Название */}
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                Название услуги *
              </Typography>
              <TextField
                placeholder="Например: УЗИ брюшной полости"
                value={name}
                onChange={(e) => setName(e.target.value)}
                fullWidth
                error={nameError}
                helperText={nameError ? "Обязательное поле" : ""}
                disabled={busy}
              />
            </Stack>

            {/* Филиалы */}
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                Филиалы *
              </Typography>
              {noBranches ? (
                <Alert severity="warning">Сначала создайте филиал</Alert>
              ) : (
                <Autocomplete
                  multiple
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
                      placeholder={selectedBranches.length === 0 ? "Выберите филиалы" : ""}
                      error={branchError}
                      helperText={branchError ? "Выберите хотя бы один филиал" : ""}
                    />
                  )}
                />
              )}
            </Stack>

            {/* Стоимость + Длительность */}
            <Stack direction="row" spacing={1.5}>
              <Stack spacing={0.5} sx={{ flex: 1 }}>
                <Typography variant="body2" color="text.secondary" fontWeight={600}>
                  Стоимость *
                </Typography>
                <TextField
                  type="text"
                  inputMode="numeric"
                  value={price}
                  onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
                  InputProps={{ endAdornment: <InputAdornment position="end">сом</InputAdornment> }}
                  fullWidth
                  placeholder="0"
                  error={priceError}
                  helperText={priceError ? "Введите положительную стоимость" : ""}
                  disabled={busy}
                />
              </Stack>
              <Stack spacing={0.5} sx={{ flex: 1 }}>
                <Typography variant="body2" color="text.secondary" fontWeight={600}>
                  Длительность
                </Typography>
                <TextField
                  type="text"
                  inputMode="numeric"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value.replace(/[^\d]/g, ""))}
                  InputProps={{ endAdornment: <InputAdornment position="end">мин</InputAdornment> }}
                  fullWidth
                  placeholder="30"
                  disabled={busy}
                />
              </Stack>
            </Stack>

            {/* Категория (для фильтра на странице услуг) */}
            {SERVICE_CATEGORIES_ENABLED && (
              <Stack spacing={0.5}>
                <Typography variant="body2" color="text.secondary" fontWeight={600}>
                  Категория
                </Typography>
                <TextField
                  select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ServiceCategory | "")}
                  fullWidth
                  disabled={busy}
                >
                  <MenuItem value="">Без категории</MenuItem>
                  {SERVICE_CATEGORY_OPTIONS.map((c) => (
                    <MenuItem key={c} value={c}>
                      {SERVICE_CATEGORY_LABELS[c]}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
            )}

            {/* Описание */}
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                Описание
              </Typography>
              <TextField
                placeholder="Добавьте описание услуги (необязательно)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                fullWidth
                multiline
                rows={3}
                disabled={busy}
              />
            </Stack>

            {/* Статус */}
            <Paper elevation={0} variant="outlined" sx={{ p: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Typography variant="body2">Статус услуги</Typography>
              <Tabs
                value={isActive ? 0 : 1}
                onChange={(_, v) => setIsActive(v === 0)}
                sx={{ minHeight: 32 }}
                TabIndicatorProps={{ style: { display: "none" } }}
              >
                <Tab label="Активна" sx={(theme) => ({ ...toggleTabStyles(theme, theme.palette.success.main), minHeight: 32, py: 0, px: 2 })} />
                <Tab label="Неактивна" sx={(theme) => ({ ...toggleTabStyles(theme, theme.palette.action.disabledBackground), minHeight: 32, py: 0, px: 2, "&.Mui-selected": { bgcolor: "action.selected", color: "text.primary" } })} />
              </Tabs>
            </Paper>
          </Stack>
        </Box>

        {/* Footer */}
        <Divider />
        <Box px={2} py={1.5} display="flex" justifyContent="flex-end" gap={1.5}>
          <Button onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button variant="contained" onClick={handleSubmit} disabled={busy || submitDisabled}>
            {busy ? (
              <Stack direction="row" alignItems="center" spacing={1}>
                <CircularProgress size={18} />
                <span>Сохранение…</span>
              </Stack>
            ) : (
              "Сохранить"
            )}
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
};

export default DjangoEditServiceDrawer;
