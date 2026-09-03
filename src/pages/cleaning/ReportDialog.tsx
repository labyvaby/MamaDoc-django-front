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
  cleaningRecordDate,
  createCleaningRecord,
  getCleaningEmployees,
  updateCleaningRecord,
  type CleaningEmployee,
  type CleaningPhoto,
  type CleaningRecord,
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
   * Запись, которую правим. null/undefined — обычный режим «Отметить уборку».
   * В режиме правки диалог показывает уже приложенные снимки, а на бэк уходит
   * PATCH только с изменёнными полями.
   */
  record?: CleaningRecord | null;
  /**
   * Показывать выбор исполнителя (ручное назначение уборки на сотрудника).
   * Только для cleaning.manage; без него запись создаётся на текущего юзера,
   * а при правке эти поля бэк отбивает 403.
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
 * Диалог уборки в двух режимах: «Отметить уборку» (тип + 1..15 фото, сжимаются
 * compressImage) и «Изменить запись» — тот же набор полей поверх существующей
 * записи, плюс удаление уже приложенных снимков.
 *
 * Весь стейт фотоотчёта живёт здесь; blob-URL превью освобождаются при
 * открытии/закрытии, успешной отправке и размонтировании.
 */
const ReportDialog: React.FC<ReportDialogProps> = ({
  open,
  activeTypes,
  record = null,
  canAssign = false,
  canBackdate = false,
  onClose,
  onSuccess,
}) => {
  const theme = useTheme();
  const { open: notify } = useNotification();
  const orgId = useApiOrgId();

  const isEdit = record !== null;

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [typeId, setTypeId] = React.useState<number | "">("");
  const [employeeId, setEmployeeId] = React.useState<number | "">("");
  const [date, setDate] = React.useState<Dayjs | null>(dayjs());
  const [photos, setPhotos] = React.useState<{ file: File; url: string }[]>([]);
  /** Снимки записи, помеченные к удалению (уходят в delete_photos). */
  const [removedPhotoIds, setRemovedPhotoIds] = React.useState<number[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Тип записи мог быть выключен в справочнике уже после уборки. В выборе он
  // нужен, иначе поле выглядело бы пустым и «сбрасывало» тип на глазах у
  // пользователя; сменить на него нельзя — бэк принимает только активные.
  const typeOptions: CleaningType[] = React.useMemo(() => {
    if (!record || activeTypes.some((t) => t.id === record.typeId)) return activeTypes;
    return [
      ...activeTypes,
      { id: record.typeId, name: `${record.typeName} (архивный)`, rate: "0", isActive: false },
    ];
  }, [activeTypes, record]);

  // Уже приложенные снимки — то, что останется после правки. Лимит 1..15 бэк
  // считает по результату (осталось + добавлено), так же считаем и здесь.
  const keptPhotos: CleaningPhoto[] = React.useMemo(
    () => (record?.photos ?? []).filter((p) => !removedPhotoIds.includes(p.id)),
    [record, removedPhotoIds],
  );
  const totalPhotos = keptPhotos.length + photos.length;

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

  // Сброс формы при каждом открытии: в режиме правки — значениями записи.
  React.useEffect(() => {
    if (!open) return;
    setTypeId(record ? record.typeId : activeTypes.length === 1 ? activeTypes[0].id : "");
    setEmployeeId(record ? record.employeeId : "");
    setDate(record ? dayjs(cleaningRecordDate(record)) : dayjs());
    setRemovedPhotoIds([]);
    clearPhotos();
    v.reset();
    setError(null);
    // activeTypes меняются только при рефетче типов — пересброс формы не нужен.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record, clearPhotos]);

  const handleClose = () => {
    if (busy) return;
    clearPhotos();
    onClose();
  };

  /** Общая точка добавления фото: пикер, drag&drop, вставка из буфера. */
  const addFiles = async (files: File[]) => {
    if (files.length === 0 || busy) return;
    setError(null);
    // Место считаем по итогу: в правке часть снимков уже лежит в записи.
    const room = CLEANING_MAX_PHOTOS - totalPhotos;
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

  /** Снимок записи — помечаем к удалению, файл уйдёт из хранилища после PATCH. */
  const removeExistingPhoto = (photoId: number) => {
    setError(null);
    setRemovedPhotoIds((prev) => (prev.includes(photoId) ? prev : [...prev, photoId]));
  };

  // ── Что реально изменилось (в режиме правки) ──────────────────────────────
  // Отправляем только изменённые поля: лишний `type` в PATCH переписал бы
  // ставку записи без нужды, а пустой PATCH бэк отбивает 400.
  const recordDay = record ? dayjs(cleaningRecordDate(record)) : null;
  const typeChanged = Boolean(record) && typeId !== "" && typeId !== record?.typeId;
  const employeeChanged =
    canAssign && Boolean(record) && employeeId !== "" && employeeId !== record?.employeeId;
  const dateChanged = Boolean(
    canBackdate &&
      CLEANING_BACKDATE_ENABLED &&
      record &&
      date?.isValid() &&
      recordDay &&
      !date.isSame(recordDay, "day"),
  );
  /** Правка меняет сумму в ЗП — бэк проверит заморозку месяца именно на этом. */
  const affectsMoney = typeChanged || employeeChanged || dateChanged;
  const hasChanges =
    affectsMoney || photos.length > 0 || removedPhotoIds.length > 0;

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
    photos:
      totalPhotos > 0
        ? null
        : isEdit
          ? "Оставьте хотя бы одно фото — без фотоотчёта уборку не проверить"
          : "Приложите хотя бы одно фото",
  });

  const handleEditSubmit = async () => {
    if (!record) return;
    await updateCleaningRecord(record.id, {
      typeId: typeChanged ? (typeId as number) : undefined,
      employeeId: employeeChanged ? (employeeId as number) : undefined,
      // Дата уходит только когда её реально сдвинули. Бэк, как и в POST, кладёт
      // в performedAt полдень выбранного дня и сравнивает с текущим моментом,
      // поэтому перевод записи на сегодня до 12:00 он отобьёт как «дата в
      // будущем» — показываем его текст, гадать за него не станем.
      date: dateChanged ? date!.format("YYYY-MM-DD") : undefined,
      photos: photos.length > 0 ? photos.map((p) => p.file) : undefined,
      deletePhotoIds: removedPhotoIds.length > 0 ? removedPhotoIds : undefined,
      organizationId: orgId,
    });
    notify?.({
      type: "success",
      message: "Запись изменена",
      description:
        record.status === "rejected"
          ? "Запись вернулась на проверку администратором."
          : record.status === "approved" && affectsMoney
            ? "Сумма за месяц у сотрудника пересчитана."
            : undefined,
    });
  };

  const handleSubmit = async () => {
    if (!v.validate()) return;
    if (isEdit && !hasChanges) return;
    setBusy(true);
    setError(null);
    try {
      if (isEdit) {
        await handleEditSubmit();
        clearPhotos();
        onSuccess();
        onClose();
        return;
      }
      await createCleaningRecord({
        // Тип выбран — гарантировано v.validate() выше.
        typeId: typeId as number,
        photos: photos.map((p) => p.file),
        employeeId: canAssign && employeeId !== "" ? employeeId : undefined,
        // Дату шлём только для прошедшего дня. За сегодня поле не отправляем:
        // бэк кладёт в `performedAt` полдень выбранного дня и сравнивает его с
        // текущим моментом, поэтому до 12:00 сегодняшняя дата отбивается как
        // «Дата уборки не может быть в будущем» — а уборку отмечают как раз
        // утром. Без поля бэк проставит момент создания, тот же день.
        date:
          showDate && date?.isValid() && !date.isSame(dayjs(), "day")
            ? date.format("YYYY-MM-DD")
            : undefined,
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
      // именно при отметке задним числом (а в правке — когда меняется сумма:
      // тип, исполнитель или дата): запись изменила бы уже посчитанную
      // зарплату. Общий текст про «конфликт данных» тут бесполезен.
      // 403 в правке — попытка тронуть чужое/подтверждённое без cleaning.manage;
      // кнопку «Изменить» мы там и не показываем, но право могло измениться в
      // соседней вкладке.
      setError(
        err instanceof ApiError && err.status === 409
          ? isEdit
            ? "Месяц закрыт в зарплате — изменить подтверждённую уборку нельзя, пока бухгалтер не разморозит период."
            : "Месяц закрыт в зарплате — отметить уборку за эту дату нельзя, пока бухгалтер не разморозит период."
          : err instanceof ApiError && err.status === 403 && isEdit
            ? "Недостаточно прав, чтобы изменить эту запись."
            : getErrorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>{isEdit ? "Изменить запись об уборке" : "Отметить уборку"}</DialogTitle>
      <DialogContent onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {/* Что случится после сохранения — статус меняет бэк сам, кнопки
              «отправить на повторную проверку» в контракте нет. */}
          {isEdit && record?.status === "rejected" && (
            <Alert severity="info">
              После сохранения запись вернётся на проверку — причина отказа очистится.
            </Alert>
          )}
          {isEdit && record?.status === "approved" && (
            <Alert severity={affectsMoney ? "warning" : "info"}>
              {affectsMoney
                ? "Уборка подтверждена и учтена в зарплате — сумма за месяц у сотрудника пересчитается."
                : "Уборка подтверждена: правка фото сумму в зарплате не меняет."}
            </Alert>
          )}
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
            {typeOptions.map((t) => (
              <MenuItem key={t.id} value={String(t.id)}>
                {t.name}
              </MenuItem>
            ))}
          </TextField>

          {/* Фото: сперва уже приложенные к записи, следом добавляемые */}
          <Stack ref={v.anchor("photos")} direction="row" gap={1} flexWrap="wrap">
            {keptPhotos.map((photo, i) => (
              <Box key={photo.id} sx={{ position: "relative" }}>
                <Box
                  component="img"
                  src={photo.url}
                  alt={`Фото ${i + 1}`}
                  loading="lazy"
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
                  onClick={() => removeExistingPhoto(photo.id)}
                  disabled={busy}
                  aria-label="Удалить фото"
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
            {photos.map((photo, i) => (
              <Box key={photo.url} sx={{ position: "relative" }}>
                <Box
                  component="img"
                  src={photo.url}
                  alt={`Фото ${keptPhotos.length + i + 1}`}
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
            {totalPhotos < CLEANING_MAX_PHOTOS && (
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
            {v.errorOf("photos") ?? (
              <>
                От 1 до {CLEANING_MAX_PHOTOS} фото — фотоотчёт обязателен, по нему администратор
                подтверждает уборку. Можно перетащить файлы сюда или вставить из буфера (Ctrl+V).
              </>
            )}
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
        {/* Пустой PATCH бэк отбивает 400 — вместо непонятной ошибки просто
            говорим, что сохранять нечего. */}
        {isEdit && !hasChanges && (
          <Typography variant="caption" color="text.secondary" sx={{ mr: "auto", pl: 1 }}>
            Изменений нет
          </Typography>
        )}
        <Button onClick={handleClose} disabled={busy}>
          Отмена
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={busy || (isEdit && !hasChanges)}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {busy ? (isEdit ? "Сохранение…" : "Отправка…") : isEdit ? "Сохранить" : "Отправить"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReportDialog;
