import React from "react";
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { useNotification } from "@refinedev/core";

import ServicePhotoUploader from "./ServicePhotoUploader";
import {
  updateService,
  uploadServiceImage,
  deleteServiceImage,
  type Service,
} from "../../api/catalog";

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

  const [name, setName] = React.useState(record.name);
  const [price, setPrice] = React.useState(record.basePrice ?? "");
  const [durationMinutes, setDurationMinutes] = React.useState(String(record.durationMinutes ?? 30));
  const [description, setDescription] = React.useState(record.description ?? "");
  const [isActive, setIsActive] = React.useState(record.isActive ?? true);
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(record.imageUrl ?? null);
  const [removePhoto, setRemovePhoto] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setName(record.name);
      setPrice(record.basePrice ?? "");
      setDurationMinutes(String(record.durationMinutes ?? 30));
      setDescription(record.description ?? "");
      setIsActive(record.isActive ?? true);
      setPhotoFile(null);
      setPhotoPreview(record.imageUrl ?? null);
      setRemovePhoto(false);
      setBusy(false);
      setTouched(false);
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
      // cleared by user — mark for removal
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
    setBusy(true);
    try {
      await updateService(record.id, {
        name: name.trim(),
        description: description.trim() || null,
        durationMinutes: durNum > 0 ? durNum : 30,
        basePrice: String(priceNum),
        isActive,
      });
      if (photoFile) {
        await uploadServiceImage(record.id, photoFile);
      } else if (removePhoto && record.imageUrl) {
        await deleteServiceImage(record.id);
      }
      notify?.({ type: "success", message: "Услуга обновлена" });
      onUpdated?.();
      onClose();
    } catch (e) {
      notify?.({ type: "error", message: e instanceof Error ? e.message : "Не удалось обновить услугу" });
    } finally {
      setBusy(false);
    }
  };

  const submitDisabled = !name.trim() || !price || Number(price) <= 0;
  const nameError = touched && !name.trim();
  const priceError = touched && (!price || Number(price) <= 0);

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
              />
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
                />
              </Stack>
            </Stack>

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
