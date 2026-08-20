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
import dayjs, { type Dayjs } from "dayjs";

import { useAllActiveEmployees } from "../../hooks/useAllActiveEmployees";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useFormValidation } from "../../hooks/useFormValidation";
import { ApiError, getErrorMessage } from "../../api/client";
import { djangoQueryKeys } from "../../api/queryKeys";
import { prepareImageForUpload, PHOTO_ACCEPT } from "../../utility/imageCompression";
import { CustomDatePicker } from "../../components/ui";
import {
  CLEANING_BACKDATE_ENABLED,
  CLEANING_MAX_PHOTOS,
  CLEANING_PHOTO_MAX_SIZE_MB,
  CLEANING_PHOTO_TARGET_BYTES,
  createCleaningRecord,
  getCleaningEmployees,
  type CleaningEmployee,
  type CleaningType,
} from "../../api/cleaning";

// Стабильная ссылка на пустой список: `?? []` пересоздавал бы массив каждый
// рендер и обнулял мемоизацию сортировки.
const NO_EMPLOYEES: CleaningEmployee[] = [];

interface ReportDialogProps {
  open: boolean;
  /** Активные типы уборки для выбора (уже отфильтрованы родителем). */
  activeTypes: CleaningType[];
  /**
   * Показывать выбор исполнителя (ручное назначение уборки на сотрудника).
   * Только для cleaning.manage; без него запись создаётся на текущего юзера.
   */
  canAssign?: boolean;
  /**
   * Разрешить выбрать дату уборки (в т.ч. прошедшую — «забыли отметить вчера»).
   * Только для cleaning.manage; уборщица всегда отмечает текущим днём.
   */
  canBackdate?: boolean;
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
  canBackdate = false,
  onClose,
  onSuccess,
}) => {
  const theme = useTheme();
  const { open: notify } = useNotification();
  const orgId = useApiOrgId();

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [typeId, setTypeId] = React.useState<number | "">("");
  const [employeeId, setEmployeeId] = React.useState<number | "">("");
  const [date, setDate] = React.useState<Dayjs | null>(dayjs());
  const [photos, setPhotos] = React.useState<{ file: File; url: string }[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Список уборщиц — грузим только когда селектор нужен (canAssign) и открыт.
  const employeesQuery = useQuery({
    queryKey: djangoQueryKeys.cleaning.employees(orgId ?? null),
    queryFn: ({ signal }) => getCleaningEmployees(orgId, signal),
    enabled: open && canAssign,
  });
  const employees = employeesQuery.data ?? NO_EMPLOYEES;

  // Роль сотрудника берём из справочника штата: /cleaning/employees/ отдаёт
  // только id и ФИО (проверено на проде 20.08.2026), а в списке кандидатов
  // помимо уборщиц сидят все, у кого есть право отмечать уборку — регистраторы
  // и суперадмины. Без подписи выбрать нужного человека можно только по памяти.
  // Тикет на поле `role` в ответе — MamaDoc/backend_ticket_cleaning_employee_role.md.
  const { employees: staff } = useAllActiveEmployees(open && canAssign);
  const roleByEmployee = React.useMemo(() => {
    const map = new Map<number, { name: string; code: string }>();
    staff.forEach((emp) => {
      if (emp.role) map.set(emp.id, { name: emp.role.name, code: emp.role.code });
    });
    return map;
  }, [staff]);

  // Уборщицы — наверх списка, остальные (право есть, но уборка не их работа) —
  // ниже, каждая группа по алфавиту. Сотрудник другого филиала в справочник
  // штата не попадает (бэк режет его по активному филиалу) — тогда роли нет и
  // человек остаётся в общей группе без подписи, а не исчезает из выбора.
  const sortedEmployees = React.useMemo(
    () =>
      [...employees].sort((a, b) => {
        const aCleaner = roleByEmployee.get(a.id)?.code === "cleaner" ? 0 : 1;
        const bCleaner = roleByEmployee.get(b.id)?.code === "cleaner" ? 0 : 1;
        if (aCleaner !== bCleaner) return aCleaner - bCleaner;
        return a.fullName.localeCompare(b.fullName, "ru");
      }),
    [employees, roleByEmployee],
  );

  // Дату уборки выбирает только админ (cleaning.manage) — уборщица отмечает
  // уборку текущим днём.
  const showDate = canBackdate && CLEANING_BACKDATE_ENABLED;

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
    setDate(dayjs());
    clearPhotos();
    v.reset();
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
      // HEIC с iPhone приходит с пустым type — проверяем и по расширению.
      const looksLikeImage =
        file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
      if (!looksLikeImage) {
        setError("Можно прикладывать только изображения.");
        return;
      }
      if (file.size > CLEANING_PHOTO_MAX_SIZE_MB * 1024 * 1024) {
        setError(`Фото «${file.name}» больше ${CLEANING_PHOTO_MAX_SIZE_MB} МБ.`);
        return;
      }
    }
    const compressed: { file: File; url: string }[] = [];
    for (const file of files) {
      // Ужимаем сразу при выборе: превью показывает то, что реально уйдёт на
      // бэк, а HEIC становится jpg (иначе превью пустое везде, кроме Safari).
      const outFile = await prepareImageForUpload(file, {
        maxBytes: CLEANING_PHOTO_TARGET_BYTES,
      });
      if (!outFile) {
        // Освобождаем URL уже созданных превью, иначе они утекут.
        compressed.forEach((p) => URL.revokeObjectURL(p.url));
        setError(`Не удалось обработать фото «${file.name}» — попробуйте другое.`);
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
  // Порядок ключей = порядок полей: в первое незаполненное уйдёт фокус.
  const v = useFormValidation({
    employeeId:
      !canAssign || employeeId !== "" ? null : "Выберите сотрудника",
    date: !showDate
      ? null
      : !date?.isValid()
        ? "Укажите дату уборки"
        : date.isAfter(dayjs(), "day")
          ? "Дата не может быть в будущем"
          : null,
    typeId: typeId !== "" ? null : "Выберите тип уборки",
    photos: photos.length > 0 ? null : "Приложите хотя бы одно фото",
  });

  const handleSubmit = async () => {
    if (!v.validate()) return;
    setBusy(true);
    setError(null);
    try {
      await createCleaningRecord({
        // Тип выбран — гарантировано v.validate() выше.
        typeId: typeId as number,
        photos: photos.map((p) => p.file),
        employeeId: canAssign && employeeId !== "" ? employeeId : undefined,
        // Дату шлём только когда её реально выбирали (иначе бэк ставит «сейчас»).
        date: showDate && date?.isValid() ? date.format("YYYY-MM-DD") : undefined,
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
      // 409 — месяц заморожен в ЗП. Проверяется по дате уборки, поэтому ловится
      // именно при отметке задним числом: запись изменила бы уже посчитанную
      // зарплату. Общий текст про «конфликт данных» тут бесполезен.
      setError(
        err instanceof ApiError && err.status === 409
          ? "Месяц закрыт в зарплате — отметить уборку за эту дату нельзя, пока бухгалтер не разморозит период."
          : getErrorMessage(err),
      );
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
              // Пункт списка двухстрочный (ФИО + роль), а в закрытом поле
              // нужна одна строка — иначе высота поля скачет и роль ломает
              // выравнивание с остальными полями формы.
              SelectProps={{
                renderValue: (value) => {
                  const emp = employees.find((e) => String(e.id) === String(value));
                  if (!emp) return "";
                  const role = roleByEmployee.get(emp.id)?.name;
                  return role ? `${emp.fullName} · ${role}` : emp.fullName;
                },
              }}
              {...v.field(
                "employeeId",
                employeesQuery.isError
                  ? "Не удалось загрузить список — попробуйте позже"
                  : employeesQuery.isSuccess && employees.length === 0
                    ? "Нет сотрудников с правом на уборку и учётной записью"
                    : "На кого записать уборку",
              )}
              error={Boolean(employeesQuery.error) || Boolean(v.errorOf("employeeId"))}
            >
              {sortedEmployees.map((emp) => {
                const role = roleByEmployee.get(emp.id)?.name;
                return (
                  <MenuItem key={emp.id} value={String(emp.id)}>
                    <Stack spacing={0} sx={{ minWidth: 0 }}>
                      <Typography variant="body2" noWrap>
                        {emp.fullName}
                      </Typography>
                      {role && (
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {role}
                        </Typography>
                      )}
                    </Stack>
                  </MenuItem>
                );
              })}
            </TextField>
          )}
          {showDate && (
            <CustomDatePicker
              label="Дата уборки"
              value={date}
              onChange={(v) => setDate(v as Dayjs | null)}
              disabled={busy}
              disableFuture
              slotProps={{
                textField: {
                  size: "small",
                  fullWidth: true,
                  error: Boolean(v.errorOf("date")),
                  helperText:
                    v.errorOf("date") ?? "Можно отметить уборку задним числом",
                  ref: v.anchor("date"),
                },
              }}
            />
          )}
          <TextField
            select
            label="Тип уборки"
            size="small"
            fullWidth
            value={typeId === "" ? "" : String(typeId)}
            onChange={(e) => setTypeId(Number(e.target.value))}
            disabled={busy}
            {...v.field("typeId")}
          >
            {activeTypes.map((t) => (
              <MenuItem key={t.id} value={String(t.id)}>
                {t.name}
              </MenuItem>
            ))}
          </TextField>

          {/* Фото */}
          <Stack ref={v.anchor("photos")} direction="row" gap={1} flexWrap="wrap">
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
          <Typography
            variant="caption"
            color={v.errorOf("photos") ? "error" : "text.secondary"}
          >
            От 1 до {CLEANING_MAX_PHOTOS} фото — фотоотчёт обязателен, по нему администратор
            подтверждает уборку. Можно перетащить файлы сюда или вставить из буфера (Ctrl+V).
          </Typography>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple
            accept={PHOTO_ACCEPT}
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
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {busy ? "Отправка…" : "Отправить"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReportDialog;
