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
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddAPhotoOutlined from "@mui/icons-material/AddAPhotoOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import { useNotification } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";

import { useApiOrgId } from "../../hooks/useApiOrgId";
import { getErrorMessage } from "../../api/client";
import { djangoQueryKeys } from "../../api/queryKeys";
import { compressImage } from "../../utility/imageCompression";
import { formatKGS } from "../../utility/format";
import {
  CLEANING_MAX_PHOTOS,
  CLEANING_PHOTO_MAX_SIZE_MB,
  createCleaningRecord,
  getCleaningEmployees,
  type CleaningType,
} from "../../api/cleaning";

interface ReportDialogProps {
  open: boolean;
  /** Активные типы уборки для выбора (уже отфильтрованы родителем). */
  activeTypes: CleaningType[];
  /**
   * Показывать выбор исполнителя (ручное назначение уборки на сотрудника).
   * Только для cleaning.manage; без него запись создаётся на текущего юзера.
   */
  canAssign?: boolean;
  onClose: () => void;
  /** Успешная отправка — родитель инвалидирует списки. */
  onSuccess: () => void;
}

/**
 * Диалог «Отметить уборку»: выбор типа уборки + 1..5 фото (сжимаются
 * compressImage). Весь стейт фотоотчёта живёт здесь; blob-URL превью
 * освобождаются при открытии/закрытии, успешной отправке и размонтировании.
 */
const ReportDialog: React.FC<ReportDialogProps> = ({
  open,
  activeTypes,
  canAssign = false,
  onClose,
  onSuccess,
}) => {
  const theme = useTheme();
  const { open: notify } = useNotification();
  const orgId = useApiOrgId();

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [typeId, setTypeId] = React.useState<number | "">("");
  const [employeeId, setEmployeeId] = React.useState<number | "">("");
  const [photos, setPhotos] = React.useState<{ file: File; url: string }[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Список уборщиц — грузим только когда селектор нужен (canAssign) и открыт.
  const employeesQuery = useQuery({
    queryKey: djangoQueryKeys.cleaning.employees(orgId ?? null),
    queryFn: ({ signal }) => getCleaningEmployees(signal),
    enabled: open && canAssign,
  });
  const employees = employeesQuery.data ?? [];

  // Единая точка освобождения blob-URL превью.
  const clearPhotos = React.useCallback(() => {
    setPhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.url));
      return [];
    });
  }, []);

  const photosRef = React.useRef(photos);
  photosRef.current = photos;
  React.useEffect(
    () => () => {
      photosRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    },
    [],
  );

  // Сброс формы при каждом открытии.
  React.useEffect(() => {
    if (!open) return;
    setTypeId(activeTypes.length === 1 ? activeTypes[0].id : "");
    setEmployeeId("");
    clearPhotos();
    setError(null);
    // activeTypes меняются только при рефетче типов — пересброс формы не нужен.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clearPhotos]);

  const handleClose = () => {
    if (busy) return;
    clearPhotos();
    onClose();
  };

  /** Общая точка добавления фото: пикер, drag&drop, вставка из буфера. */
  const addFiles = async (files: File[]) => {
    if (files.length === 0 || busy) return;
    setError(null);
    const room = CLEANING_MAX_PHOTOS - photos.length;
    if (files.length > room) {
      setError(`Не больше ${CLEANING_MAX_PHOTOS} фото на одну уборку.`);
      return;
    }
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        setError("Можно прикладывать только изображения.");
        return;
      }
    }
    const compressed: { file: File; url: string }[] = [];
    for (const file of files) {
      const result = await compressImage(file);
      const outFile =
        result instanceof File ? result : new File([result], file.name, { type: "image/jpeg" });
      if (outFile.size > CLEANING_PHOTO_MAX_SIZE_MB * 1024 * 1024) {
        // Освобождаем URL уже созданных превью, иначе они утекут.
        compressed.forEach((p) => URL.revokeObjectURL(p.url));
        setError(`Фото «${file.name}» больше ${CLEANING_PHOTO_MAX_SIZE_MB} МБ.`);
        return;
      }
      compressed.push({ file: outFile, url: URL.createObjectURL(outFile) });
    }
    setPhotos((prev) => [...prev, ...compressed]);
  };

  const handlePhotosSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // Сбрасываем value, иначе повторный выбор тех же файлов не вызовет onChange.
    e.target.value = "";
    void addFiles(files);
  };

  // Вставка фото из буфера обмена (Ctrl+V), пока диалог открыт.
  // Без массива зависимостей: слушатель пересоздаётся с актуальным замыканием.
  React.useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length > 0) {
        e.preventDefault();
        void addFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    void addFiles(Array.from(e.dataTransfer.files ?? []));
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  // При ручном назначении исполнитель обязателен: менеджер сам не уборщица,
  // писать «на себя» ему нечего — запись должна быть привязана к сотруднику.
  const canSubmit =
    typeId !== "" && photos.length > 0 && (!canAssign || employeeId !== "");

  const handleSubmit = async () => {
    if (typeId === "" || photos.length === 0) return;
    if (canAssign && employeeId === "") return;
    setBusy(true);
    setError(null);
    try {
      await createCleaningRecord({
        typeId,
        photos: photos.map((p) => p.file),
        employeeId: canAssign && employeeId !== "" ? employeeId : undefined,
        organizationId: orgId,
      });
      notify?.({
        type: "success",
        message: "Уборка отмечена",
        description: "Ожидает подтверждения администратором.",
      });
      clearPhotos();
      onSuccess();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>Отметить уборку</DialogTitle>
      <DialogContent onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {canAssign && (
            <TextField
              select
              label="Сотрудник (уборщица)"
              size="small"
              fullWidth
              value={employeeId === "" ? "" : String(employeeId)}
              onChange={(e) => setEmployeeId(Number(e.target.value))}
              disabled={busy || employeesQuery.isLoading}
              error={Boolean(employeesQuery.error)}
              helperText={
                employeesQuery.isError
                  ? "Не удалось загрузить список — попробуйте позже"
                  : employeesQuery.isSuccess && employees.length === 0
                    ? "Нет сотрудников с ролью «Уборщица»"
                    : "На кого записать уборку"
              }
            >
              {employees.map((emp) => (
                <MenuItem key={emp.id} value={String(emp.id)}>
                  {emp.fullName}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            select
            label="Тип уборки"
            size="small"
            fullWidth
            value={typeId === "" ? "" : String(typeId)}
            onChange={(e) => setTypeId(Number(e.target.value))}
            disabled={busy}
          >
            {activeTypes.map((t) => (
              <MenuItem key={t.id} value={String(t.id)}>
                {t.name} · {formatKGS(t.rate)}
              </MenuItem>
            ))}
          </TextField>

          {/* Фото */}
          <Stack direction="row" gap={1} flexWrap="wrap">
            {photos.map((photo, i) => (
              <Box key={photo.url} sx={{ position: "relative" }}>
                <Box
                  component="img"
                  src={photo.url}
                  alt={`Фото ${i + 1}`}
                  sx={{
                    width: 76,
                    height: 76,
                    objectFit: "cover",
                    borderRadius: 1.5,
                    border: `1px solid ${theme.palette.divider}`,
                  }}
                />
                <IconButton
                  size="small"
                  onClick={() => removePhoto(i)}
                  disabled={busy}
                  sx={{
                    position: "absolute",
                    top: -8,
                    right: -8,
                    bgcolor: "background.paper",
                    border: `1px solid ${theme.palette.divider}`,
                    "&:hover": { bgcolor: "background.paper" },
                  }}
                >
                  <DeleteOutlineOutlined sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
            ))}
            {photos.length < CLEANING_MAX_PHOTOS && (
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                sx={{
                  width: 76,
                  height: 76,
                  minWidth: 76,
                  borderRadius: 1.5,
                  border: `1px dashed ${theme.palette.divider}`,
                  color: "text.secondary",
                  flexDirection: "column",
                  gap: 0.5,
                  fontSize: "0.65rem",
                }}
              >
                <AddAPhotoOutlined fontSize="small" />
                Фото
              </Button>
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            От 1 до {CLEANING_MAX_PHOTOS} фото — фотоотчёт обязателен, по нему администратор
            подтверждает уборку. Можно перетащить файлы сюда или вставить из буфера (Ctrl+V).
          </Typography>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple
            accept="image/*"
            onChange={handlePhotosSelect}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={busy}>
          Отмена
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={busy || !canSubmit}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {busy ? "Отправка…" : "Отправить"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReportDialog;
