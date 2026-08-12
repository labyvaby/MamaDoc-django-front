import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddOutlined from "@mui/icons-material/AddOutlined";
import ArrowDownwardOutlined from "@mui/icons-material/ArrowDownwardOutlined";
import ArrowUpwardOutlined from "@mui/icons-material/ArrowUpwardOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import ImageOutlined from "@mui/icons-material/ImageOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";

import { compressImage } from "../../utility/imageCompression";
import {
  CONCLUSION_FORMS_BACKEND,
  REQUIRED_BLOCK_KEYS,
  REQUIRED_BLOCK_LABELS,
  emptyFormPayload,
  newFieldId,
  uploadConclusionFormBackground,
  type ConclusionFormPayload,
  type ConclusionFormTemplate,
  type FormField,
  type FormFieldType,
} from "../../api/conclusionForms";
import type { DjangoSpecialization } from "../../api/staff";
import { FormSheet, PREVIEW_CONTEXT, type SheetContext } from "./FormSheet";

/**
 * Конструктор бланка заключения.
 *
 * Слева — параметры листа и список полей, справа — живой лист: любое изменение
 * сразу видно на бумаге, как её напечатают. Обязательные блоки (ФИО пациента,
 * дата рождения, время приёма, врач, подпись, печать) показаны отдельным
 * списком и намеренно недоступны для правки — требование заказчика.
 */

const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: "Строка",
  multiline: "Текстовый блок",
};

/** Порог, после которого подложка перестаёт помещаться в localStorage. */
const BACKGROUND_WARN_BYTES = 1_500_000;

interface FormBuilderDialogProps {
  open: boolean;
  onClose: () => void;
  /** Редактируемый шаблон; null → создание нового. */
  template: ConclusionFormTemplate | null;
  specializations: DjangoSpecialization[];
  clinicName: string;
  clinicLogoUrl?: string | null;
  busy?: boolean;
  error?: string | null;
  onSave: (payload: ConclusionFormPayload) => void;
}

export const FormBuilderDialog: React.FC<FormBuilderDialogProps> = ({
  open,
  onClose,
  template,
  specializations,
  clinicName,
  clinicLogoUrl,
  busy = false,
  error = null,
  onSave,
}) => {
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down("lg"));

  const [draft, setDraft] = React.useState<ConclusionFormPayload>(emptyFormPayload);
  const [focusedFieldId, setFocusedFieldId] = React.useState<string | null>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [bgBusy, setBgBusy] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Гидратация только по открытию: пока диалог открыт, состояние принадлежит
  // пользователю, и повторный проброс того же template не должен затирать
  // правки (та же ловушка, что чинили в форме заключения — см. CLAUDE.md).
  React.useEffect(() => {
    if (!open) return;
    setDraft(
      template
        ? {
            name: template.name,
            pageSize: template.pageSize,
            orientation: template.orientation,
            specializationIds: template.specializationIds,
            title: template.title,
            subtitle: template.subtitle ?? "",
            showClinicHeader: template.showClinicHeader,
            headerContacts: template.headerContacts ?? "",
            background: template.background,
            fields: template.fields,
            footerNote: template.footerNote ?? "",
            target: template.target,
            isActive: template.isActive,
          }
        : emptyFormPayload(),
    );
    setFocusedFieldId(null);
    setLocalError(null);
  }, [open, template]);

  const patch = <K extends keyof ConclusionFormPayload>(
    key: K,
    value: ConclusionFormPayload[K],
  ) => {
    setLocalError(null);
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  // ── поля ──────────────────────────────────────────────────────────────────
  const addField = (type: FormFieldType) => {
    const field: FormField = {
      id: newFieldId(),
      label: "",
      type,
      width: type === "multiline" ? "full" : "half",
      ...(type === "multiline" ? { rows: 3 } : {}),
    };
    setDraft((prev) => ({ ...prev, fields: [...prev.fields, field] }));
    setFocusedFieldId(field.id);
  };

  const patchField = (id: string, patchValue: Partial<FormField>) =>
    setDraft((prev) => ({
      ...prev,
      fields: prev.fields.map((f) => (f.id === id ? { ...f, ...patchValue } : f)),
    }));

  const removeField = (id: string) =>
    setDraft((prev) => ({ ...prev, fields: prev.fields.filter((f) => f.id !== id) }));

  const moveField = (index: number, delta: number) =>
    setDraft((prev) => {
      const next = [...prev.fields];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, fields: next };
    });

  // ── подложка ──────────────────────────────────────────────────────────────
  const handleBackgroundPick = async (file: File | undefined) => {
    if (!file) return;
    setBgBusy(true);
    setLocalError(null);
    try {
      // С бэкендом картинка уезжает в хранилище, в шаблоне остаётся ссылка —
      // ни квоты, ни агрессивного сжатия.
      if (CONCLUSION_FORMS_BACKEND) {
        const { url } = await uploadConclusionFormBackground(file);
        setDraft((prev) => ({
          ...prev,
          background: { ...prev.background, imageUrl: url },
        }));
        return;
      }
      // Без бэка подложка хранится как data-URL в localStorage, поэтому жмём
      // заметно сильнее обычной загрузки: у хранилища квота ~5 МБ.
      const compressed = await compressImage(file, 1240, 0.62);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
        reader.readAsDataURL(compressed);
      });
      if (dataUrl.length > BACKGROUND_WARN_BYTES) {
        setLocalError(
          "Подложка слишком тяжёлая даже после сжатия — возьмите картинку меньшего размера.",
        );
        return;
      }
      setDraft((prev) => ({
        ...prev,
        background: { ...prev.background, imageUrl: dataUrl },
      }));
    } catch (e) {
      setLocalError(
        e instanceof Error && e.message
          ? e.message
          : "Не удалось обработать изображение — попробуйте другой файл.",
      );
    } finally {
      setBgBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── сохранение ────────────────────────────────────────────────────────────
  const handleSave = () => {
    if (!draft.name.trim()) {
      setLocalError("Укажите название шаблона.");
      return;
    }
    if (draft.fields.some((f) => !f.label.trim())) {
      setLocalError("У каждого поля должна быть подпись.");
      return;
    }
    onSave({
      ...draft,
      name: draft.name.trim(),
      title: draft.title.trim(),
      fields: draft.fields.map((f) => ({ ...f, label: f.label.trim() })),
    });
  };

  const previewContext: SheetContext = {
    ...PREVIEW_CONTEXT,
    clinicName: clinicName || PREVIEW_CONTEXT.clinicName,
    clinicLogoUrl,
  };

  // Лист вписывается по ширине колонки превью: у альбомного A4 ширина 297 мм,
  // у портретного A5 — 148, один фиксированный масштаб им не подходит.
  const previewScale = draft.orientation === "landscape" ? 0.42 : 0.55;

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="xl"
      fullWidth
      fullScreen={isNarrow}
    >
      <DialogTitle sx={{ pr: 6 }}>
        {template ? "Редактирование бланка" : "Новый бланк"}
        <IconButton
          onClick={busy ? undefined : onClose}
          size="small"
          sx={{ position: "absolute", right: 12, top: 12 }}
        >
          <CloseOutlined fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {(error || localError) && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setLocalError(null)}>
            {error || localError}
          </Alert>
        )}

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) auto" },
            gap: 3,
            alignItems: "start",
          }}
        >
          {/* ── левая колонка: параметры ── */}
          <Stack spacing={2.5} sx={{ minWidth: 0 }}>
            <TextField
              label="Название шаблона"
              size="small"
              fullWidth
              autoFocus
              value={draft.name}
              onChange={(e) => patch("name", e.target.value)}
              placeholder="Протокол УЗИ малого таза"
            />

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Лист
              </Typography>
              <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={draft.pageSize}
                  onChange={(_, v) => v && patch("pageSize", v)}
                >
                  <ToggleButton value="A4">A4</ToggleButton>
                  <ToggleButton value="A5">A5</ToggleButton>
                </ToggleButtonGroup>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={draft.orientation}
                  onChange={(_, v) => v && patch("orientation", v)}
                >
                  <ToggleButton value="portrait">Вертикальный</ToggleButton>
                  <ToggleButton value="landscape">Горизонтальный</ToggleButton>
                </ToggleButtonGroup>
              </Stack>
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Шапка листа
              </Typography>
              <Stack spacing={1.5}>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={draft.showClinicHeader}
                      onChange={(e) => patch("showClinicHeader", e.target.checked)}
                    />
                  }
                  label="Показывать название и логотип клиники"
                />
                {draft.showClinicHeader && (
                  <TextField
                    label="Контакты в шапке"
                    size="small"
                    fullWidth
                    multiline
                    minRows={2}
                    value={draft.headerContacts ?? ""}
                    onChange={(e) => patch("headerContacts", e.target.value)}
                    placeholder={"Кыргызстан, г. Бишкек, ул. Скрябина 50а\ntel. WhatsApp 0552 111 221"}
                    helperText="Адрес и телефон вводятся здесь: в данных организации их нет."
                  />
                )}
                <TextField
                  label="Заголовок документа"
                  size="small"
                  fullWidth
                  value={draft.title}
                  onChange={(e) => patch("title", e.target.value)}
                  placeholder="Протокол ультразвукового исследования"
                />
                <TextField
                  label="Подзаголовок"
                  size="small"
                  fullWidth
                  value={draft.subtitle ?? ""}
                  onChange={(e) => patch("subtitle", e.target.value)}
                  placeholder="малого таза"
                />
              </Stack>
            </Box>

            <Divider />

            {/* Фон листа */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Фон листа
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ImageOutlined />}
                  disabled={bgBusy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {draft.background.imageUrl ? "Заменить подложку" : "Загрузить подложку"}
                </Button>
                {draft.background.imageUrl && (
                  <Button
                    size="small"
                    color="error"
                    startIcon={<DeleteOutline />}
                    onClick={() =>
                      patch("background", { ...draft.background, imageUrl: null })
                    }
                  >
                    Убрать
                  </Button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => handleBackgroundPick(e.target.files?.[0])}
                />
              </Stack>
              {draft.background.imageUrl && (
                <Box sx={{ mt: 1.5, maxWidth: 320 }}>
                  <Typography variant="caption" color="text.secondary">
                    Насыщенность подложки
                  </Typography>
                  <Slider
                    size="small"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={draft.background.opacity}
                    onChange={(_, v) =>
                      patch("background", {
                        ...draft.background,
                        opacity: Array.isArray(v) ? v[0] : v,
                      })
                    }
                    valueLabelDisplay="auto"
                    valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
                  />
                </Box>
              )}
            </Box>

            <Divider />

            {/* Обязательные блоки */}
            <Box>
              <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1 }}>
                <LockOutlined fontSize="small" color="disabled" />
                <Typography variant="subtitle2">Обязательные блоки</Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Есть в каждом бланке и заполняются из приёма — удалить нельзя.
              </Typography>
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                {REQUIRED_BLOCK_KEYS.map((key) => (
                  <Chip key={key} size="small" variant="outlined" label={REQUIRED_BLOCK_LABELS[key]} />
                ))}
              </Stack>
            </Box>

            <Divider />

            {/* Поля */}
            <Box>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                spacing={1}
                sx={{ mb: 1 }}
              >
                <Typography variant="subtitle2">Поля бланка</Typography>
                <Stack direction="row" spacing={1}>
                  <Button size="small" startIcon={<AddOutlined />} onClick={() => addField("text")}>
                    Строка
                  </Button>
                  <Button
                    size="small"
                    startIcon={<AddOutlined />}
                    onClick={() => addField("multiline")}
                  >
                    Блок текста
                  </Button>
                </Stack>
              </Stack>

              {draft.fields.length === 0 ? (
                <Paper variant="outlined" sx={{ p: 2, textAlign: "center" }}>
                  <Typography variant="body2" color="text.secondary">
                    Полей пока нет. Добавьте строку или блок текста — они сразу появятся
                    на листе справа.
                  </Typography>
                </Paper>
              ) : (
                <Stack spacing={1.25}>
                  {draft.fields.map((field, index) => (
                    <Paper
                      key={field.id}
                      variant="outlined"
                      sx={{ p: 1.5 }}
                      onFocusCapture={() => setFocusedFieldId(field.id)}
                      onBlurCapture={() => setFocusedFieldId(null)}
                    >
                      <Stack spacing={1.25}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <TextField
                            label="Подпись поля"
                            size="small"
                            fullWidth
                            value={field.label}
                            onChange={(e) => patchField(field.id, { label: e.target.value })}
                            placeholder="Положение плода"
                          />
                          <Tooltip title="Выше">
                            <span>
                              <IconButton
                                size="small"
                                disabled={index === 0}
                                onClick={() => moveField(index, -1)}
                              >
                                <ArrowUpwardOutlined fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Ниже">
                            <span>
                              <IconButton
                                size="small"
                                disabled={index === draft.fields.length - 1}
                                onClick={() => moveField(index, 1)}
                              >
                                <ArrowDownwardOutlined fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Удалить поле">
                            <IconButton size="small" onClick={() => removeField(field.id)}>
                              <DeleteOutline fontSize="small" color="error" />
                            </IconButton>
                          </Tooltip>
                        </Stack>

                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          <Select
                            size="small"
                            value={field.type}
                            onChange={(e) =>
                              patchField(field.id, { type: e.target.value as FormFieldType })
                            }
                            sx={{ minWidth: 150 }}
                          >
                            {(Object.keys(FIELD_TYPE_LABELS) as FormFieldType[]).map((type) => (
                              <MenuItem key={type} value={type}>
                                {FIELD_TYPE_LABELS[type]}
                              </MenuItem>
                            ))}
                          </Select>
                          <Select
                            size="small"
                            value={field.width ?? "full"}
                            onChange={(e) =>
                              patchField(field.id, {
                                width: e.target.value as FormField["width"],
                              })
                            }
                            sx={{ minWidth: 150 }}
                          >
                            <MenuItem value="full">Во всю ширину</MenuItem>
                            <MenuItem value="half">В половину</MenuItem>
                          </Select>
                          {field.type === "multiline" && (
                            <TextField
                              label="Высота, строк"
                              size="small"
                              type="number"
                              value={field.rows ?? 3}
                              onChange={(e) =>
                                patchField(field.id, {
                                  rows: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                                })
                              }
                              sx={{ width: 130 }}
                            />
                          )}
                        </Stack>

                        <TextField
                          label="Текст по умолчанию"
                          size="small"
                          fullWidth
                          multiline={field.type === "multiline"}
                          minRows={field.type === "multiline" ? 2 : undefined}
                          value={field.defaultValue ?? ""}
                          onChange={(e) => patchField(field.id, { defaultValue: e.target.value })}
                          placeholder="Кожа и видимые слизистые чистые"
                          helperText="Подставится врачу при заполнении — он поправит только то, что отличается."
                        />
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Box>

            <Divider />

            <TextField
              label="Примечание внизу листа"
              size="small"
              fullWidth
              multiline
              minRows={2}
              value={draft.footerNote ?? ""}
              onChange={(e) => patch("footerNote", e.target.value)}
              placeholder="УЗИ является методом клинической визуализации…"
            />

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Кому доступен
              </Typography>
              <Select
                multiple
                size="small"
                fullWidth
                displayEmpty
                value={draft.specializationIds}
                onChange={(e) =>
                  patch("specializationIds", e.target.value as number[])
                }
                renderValue={(selected) =>
                  selected.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      Всем специализациям
                    </Typography>
                  ) : (
                    specializations
                      .filter((s) => selected.includes(s.id))
                      .map((s) => s.name)
                      .join(", ")
                  )
                }
              >
                {specializations.map((spec) => (
                  <MenuItem key={spec.id} value={spec.id}>
                    <Checkbox
                      size="small"
                      checked={draft.specializationIds.includes(spec.id)}
                    />
                    <ListItemText primary={spec.name} />
                  </MenuItem>
                ))}
              </Select>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Куда попадёт заполненный текст
              </Typography>
              <Select
                size="small"
                fullWidth
                value={draft.target}
                onChange={(e) => patch("target", e.target.value as ConclusionFormPayload["target"])}
              >
                <MenuItem value="conclusion">Заключение / рекомендации</MenuItem>
                <MenuItem value="anamnesis">Анамнез</MenuItem>
                <MenuItem value="objective">Объективно</MenuItem>
              </Select>
            </Box>
          </Stack>

          {/* ── правая колонка: живой лист ── */}
          <Box
            sx={{
              position: { lg: "sticky" },
              top: 0,
              justifySelf: { xs: "center", lg: "end" },
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
              Так бланк выйдет на печать
            </Typography>
            <FormSheet
              template={draft}
              context={previewContext}
              scale={previewScale}
              highlightFieldId={focusedFieldId}
            />
          </Box>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={busy}>
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FormBuilderDialog;
