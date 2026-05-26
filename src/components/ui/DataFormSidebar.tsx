/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import {
  Alert,
  Box,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import Autocomplete from "@mui/material/Autocomplete";
import Checkbox from "@mui/material/Checkbox";
import { AppButton } from "./AppButton";
import { supabase } from "../../utility/supabaseClient";

export type Mode = "create" | "edit";

export type FieldType =
  | "text"
  | "number"
  | "date"
  | "time"
  | "select"
  | "autocomplete"
  | "password"
  | "textarea";

type AnyRecord = Record<string, any>;

type BaseFieldConfig = {
  name: string;
  label?: string;
  type: FieldType;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  helperText?: string;
  defaultValue?: any;
  // Кастомный рендер (полный контроль)
  render?: (args: {
    value: any;
    onChange: (v: any) => void;
    disabled: boolean;
  }) => React.ReactNode;
  // Кастомная сериализация значения в payload (например, выбрать full_uuid)
  serialize?: (value: any) => any;
};

type SelectFieldConfig = BaseFieldConfig & {
  type: "select";
  options:
  | Array<string | number>
  | Array<{ label: string; value: any }>;
};

type AutocompleteFieldConfig = BaseFieldConfig & {
  type: "autocomplete";
  multiple?: false; // для простоты (можно расширить при необходимости)
  options?: any[];
  loadOptions?: () => Promise<any[]>;
  getOptionLabel?: (o: any) => string;
  getOptionValue?: (o: any) => string | number;
  isOptionEqualToValue?: (o: any, v: any) => boolean;
  // Пользовательская функция фильтрации (например, для поиска по нескольким полям)
  filterOptions?: (options: any[], state: any) => any[];
};

export type FieldConfig =
  | BaseFieldConfig
  | SelectFieldConfig
  | AutocompleteFieldConfig;

export type DataFormSidebarProps = {
  tableName: string;
  mode: Mode;
  isOpen: boolean;
  recordId?: string;
  fieldsConfig: FieldConfig[];
  onClose: () => void;
  onSuccess: () => void;
  // Переопределение заголовка (по умолчанию строится автоматически)
  titleBuilder?: (ctx: {
    mode: Mode;
    tableName: string;
    record?: AnyRecord | null;
    recordId?: string;
  }) => string;
  // Переопределение текста кнопки Submit
  submitLabelBuilder?: (mode: Mode) => string;
};

const isEmptyValue = (v: any) => {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim().length === 0;
  return false;
};

// Небольшая эвристика для сериализации *_id из объектов (учитывает full_uuid)
const defaultIdSerializer = (value: any) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    if (typeof value.full_uuid === "string" && value.full_uuid) return value.full_uuid;
    if (typeof value.id === "string" || typeof value.id === "number") return value.id;
    if (typeof value.value === "string" || typeof value.value === "number") return value.value;
  }
  return value;
};

const normalizeSelectOption = (opt: any): { label: string; value: any } => {
  if (typeof opt === "object" && opt !== null && "label" in opt && "value" in opt) return opt;
  return { label: String(opt), value: opt };
};

const useMountedRef = () => {
  const ref = React.useRef(false);
  React.useEffect(() => {
    ref.current = true;
    return () => {
      ref.current = false;
    };
  }, []);
  return ref;
};

const DataFormSidebar: React.FC<DataFormSidebarProps> = ({
  tableName,
  mode,
  isOpen,
  recordId,
  fieldsConfig,
  onClose,
  onSuccess,
  titleBuilder,
  submitLabelBuilder,
}) => {
  const mounted = useMountedRef();

  const [busy, setBusy] = React.useState(false);
  const [loadingRecord, setLoadingRecord] = React.useState(false);
  const [record, setRecord] = React.useState<AnyRecord | null>(null);

  // Внутреннее состояние значений формы
  const [values, setValues] = React.useState<AnyRecord>({});
  // Для autocomplete: карты опций и загрузки
  const [acOptions, setAcOptions] = React.useState<Record<string, any[]>>({});
  const [acLoading, setAcLoading] = React.useState<Record<string, boolean>>({});

  // Snackbar
  const [snack, setSnack] = React.useState<{
    open: boolean;
    severity: "success" | "error" | "info";
    message: string;
  }>({ open: false, severity: "success", message: "" });

  // Dialog удаления
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  // Сброс состояния при открытии/закрытии
  React.useEffect(() => {
    if (!isOpen) {
      setBusy(false);
      setLoadingRecord(false);
      setRecord(null);
      setValues({});
      setAcOptions({});
      setAcLoading({});
      setConfirmOpen(false);
      return;
    }

    let cancelled = false;

    const init = async () => {
      try {
        // 1) Параллельно загрузим options для всех autocomplete
        const acFields = fieldsConfig.filter((f): f is AutocompleteFieldConfig => f.type === "autocomplete");
        // Инициализация флагов загрузки
        const loadingMap: Record<string, boolean> = {};
        for (const f of acFields) loadingMap[f.name] = true;
        if (!cancelled) setAcLoading((m) => ({ ...m, ...loadingMap }));

        const loadAcPromises = acFields.map(async (f) => {
          try {
            let opts: any[] = Array.isArray((f as any).options) ? ((f as any).options as any[]) : [];
            if (!opts.length && typeof (f as any).loadOptions === "function") {
              opts = await (f as any).loadOptions();
            }
            return { name: f.name, options: Array.isArray(opts) ? opts : [] };
          } catch {
            return { name: f.name, options: [] as any[] };
          }
        });

        // 2) Если edit - загрузим запись
        let rec: AnyRecord | null = null;
        if (mode === "edit" && recordId) {
          setLoadingRecord(true);
          const { data, error } = await supabase
            .from(tableName)
            .select("*")
            .eq("id", recordId)
            .single();
          if (error) throw error;
          rec = data as AnyRecord;
        }

        const acResults = await Promise.all(loadAcPromises);

        if (cancelled || !mounted.current) return;

        // Применяем загруженные options
        const optsMap: Record<string, any[]> = {};
        const loadingDone: Record<string, boolean> = {};
        for (const r of acResults) {
          optsMap[r.name] = r.options;
          loadingDone[r.name] = false;
        }
        setAcOptions(optsMap);
        setAcLoading((m) => ({ ...m, ...loadingDone }));

        if (mode === "edit") setRecord(rec);

        // Инициализируем значения формы
        const initial: AnyRecord = {};
        for (const f of fieldsConfig) {
          // Приоритет значений:
          // 1) edit: берем из записи
          // 2) иначе: из defaultValue
          let v: any =
            mode === "edit" && rec ? rec[f.name] : f.defaultValue ?? "";

          // Для autocomplete - попробуем сопоставить объект опции по id
          if (f.type === "autocomplete") {
            const cfg = f as AutocompleteFieldConfig;
            const opts = optsMap[f.name] ?? [];
            const getVal =
              cfg.getOptionValue ||
              ((o: any) => (typeof o?.id !== "undefined" ? o.id : o?.value));
            // Если v - строка/число (id), пытаемся найти объект в options
            if (typeof v === "string" || typeof v === "number") {
              const found = opts.find((o) => getVal(o) === v);
              v = found ?? null;
            }
            // Если ничего не нашли, null
            if (v === undefined) v = null;
          }

          // Для числа - приводим к строке/числу в зависимости от UX (оставим как есть, но пустое => "")
          if (f.type === "number" && (v === null || typeof v === "undefined")) {
            v = "";
          }

          initial[f.name] = v;
        }
        setValues(initial);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("DataFormSidebar init failed:", e);
        if (!cancelled) {
          setSnack({ open: true, severity: "error", message: "Ошибка загрузки данных." });
        }
      } finally {
        if (!cancelled) setLoadingRecord(false);
      }
    };

    init();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode, recordId, tableName]);

  const title = React.useMemo(() => {
    if (typeof titleBuilder === "function") {
      return titleBuilder({ mode, tableName, record, recordId });
    }
    // Специальные заголовки для таблицы shifts
    if (tableName.toLowerCase() === "shifts") {
      if (mode === "create") return "Добавление новой смены";
      const suffix =
        record?.shift_date ? ` ${String(record.shift_date)}` : recordId ? ` ${recordId}` : "";
      return `Редактирование смены${suffix}`;
    }
    // Общий случай
    return mode === "create" ? "Добавление записи" : "Редактирование записи";
  }, [mode, tableName, titleBuilder, record, recordId]);

  const submitLabel = React.useMemo(() => {
    if (typeof submitLabelBuilder === "function") return submitLabelBuilder(mode);
    return mode === "create" ? "Сохранить" : "Сохранить изменения";
  }, [mode, submitLabelBuilder]);

  const onFieldChange = (name: string, v: any) => {
    setValues((prev) => ({ ...prev, [name]: v }));
  };

  const requiredInvalid = React.useMemo(() => {
    return fieldsConfig.some((f) => {
      if (!f.required) return false;
      const v = values[f.name];
      if (f.type === "autocomplete") return v === null || typeof v === "undefined";
      if (f.type === "number") return v === "" || v === null || typeof v === "undefined";
      return isEmptyValue(v);
    });
  }, [fieldsConfig, values]);

  const canSubmit = !busy && !loadingRecord && !requiredInvalid;

  const buildPayload = (): AnyRecord => {
    const out: AnyRecord = {};
    for (const f of fieldsConfig) {
      const v = values[f.name];

      if (typeof f.serialize === "function") {
        out[f.name] = f.serialize(v);
        continue;
      }

      if (f.type === "autocomplete") {
        // эвристика: если поле заканчивается на "_id" - берем full_uuid|id
        if (f.name.endsWith("_id")) {
          out[f.name] = defaultIdSerializer(v);
        } else {
          // иначе попробуем вытащить value/id
          out[f.name] = defaultIdSerializer(v);
        }
        continue;
      }

      if (f.type === "select") {
        if (v && typeof v === "object" && "value" in v) {
          out[f.name] = (v as any).value;
        } else {
          out[f.name] = v ?? null;
        }
        continue;
      }

      if (f.type === "number") {
        if (v === "" || v === null || typeof v === "undefined") out[f.name] = null;
        else out[f.name] = Number(v);
        continue;
      }

      out[f.name] = v ?? null;
    }
    return out;
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      setBusy(true);
      const payload = buildPayload();

      if (mode === "create") {
        const { error } = await supabase.from(tableName).insert(payload).select("*").single();
        if (error) throw error;
      } else {
        if (!recordId) throw new Error("recordId отсутствует");
        const { error } = await supabase
          .from(tableName)
          .update(payload)
          .eq("id", recordId)
          .select("*")
          .single();
        if (error) throw error;
      }

      setSnack({
        open: true,
        severity: "success",
        message: mode === "create" ? "Запись создана" : "Изменения сохранены",
      });
      onSuccess();
      onClose();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Save failed:", e);
      setSnack({
        open: true,
        severity: "error",
        message:
          mode === "create"
            ? "Не удалось создать запись. Проверьте схему таблицы и права RLS."
            : "Не удалось сохранить изменения. Проверьте схему таблицы и права RLS.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (mode !== "edit" || !recordId) return;
    try {
      setBusy(true);
      const { error } = await supabase.from(tableName).delete().eq("id", recordId);
      if (error) throw error;

      setSnack({
        open: true,
        severity: "success",
        message: "Запись удалена",
      });
      setConfirmOpen(false);
      onSuccess();
      onClose();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Delete failed:", e);
      setSnack({
        open: true,
        severity: "error",
        message: "Не удалось удалить запись. Проверьте права RLS.",
      });
    } finally {
      setBusy(false);
    }
  };

  const renderField = (f: FieldConfig) => {
    const value = values[f.name];
    const disabled = !!f.disabled || busy || loadingRecord;

    if (typeof f.render === "function") {
      return <Box key={f.name}>{f.render({ value, onChange: (v) => onFieldChange(f.name, v), disabled })}</Box>;
    }

    switch (f.type) {
      case "text":
      case "password":
      case "date":
      case "time":
      case "textarea": {
        const multiline = f.type === "textarea";
        const type =
          f.type === "password" ? "password" : f.type === "text" || multiline ? "text" : f.type;

        // For textarea, use placeholder instead of label to avoid floating label behavior
        if (multiline) {
          return (
            <TextField
              key={f.name}
              type={type}
              value={value ?? ""}
              onChange={(e) => onFieldChange(f.name, e.target.value)}
              placeholder={f.placeholder || f.label}
              helperText={f.helperText}
              fullWidth
              required={f.required}
              disabled={disabled}
              multiline={multiline}
            />
          );
        }

        return (
          <TextField
            key={f.name}
            label={f.label}
            type={type}
            value={value ?? ""}
            onChange={(e) => onFieldChange(f.name, e.target.value)}
            placeholder={f.placeholder}
            helperText={f.helperText}
            InputLabelProps={{ shrink: true }}
            fullWidth
            required={f.required}
            disabled={disabled}
            multiline={multiline}
          />
        );
      }

      case "number": {
        return (
          <TextField
            key={f.name}
            label={f.label}
            type="text"
            inputMode="numeric"
            value={value ?? ""}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d\-.,]/g, "").replace(",", ".");
              onFieldChange(f.name, v);
            }}
            placeholder={f.placeholder}
            helperText={f.helperText}
            InputLabelProps={{ shrink: true }}
            fullWidth
            required={f.required}
            disabled={disabled}
            InputProps={{
              endAdornment: <InputAdornment position="end"></InputAdornment>,
            }}
          />
        );
      }

      case "select": {
        const options = (f as SelectFieldConfig).options.map(normalizeSelectOption);
        return (
          <TextField
            key={f.name}
            label={f.label}
            select
            fullWidth
            value={value ?? ""}
            onChange={(e) => onFieldChange(f.name, e.target.value)}
            required={f.required}
            disabled={disabled}
          >
            {options.map((o) => (
              <MenuItem key={String(o.value)} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
        );
      }

      case "autocomplete": {
        const cfg = f as AutocompleteFieldConfig;
        const opts = acOptions[f.name] ?? [];
        const getOptionLabel =
          cfg.getOptionLabel ||
          ((o: any) => o?.full_name || o?.name || o?.label || o?.id || "");
        const isEq =
          cfg.isOptionEqualToValue ||
          ((o: any, v: any) =>
            (typeof o?.id !== "undefined" && typeof v?.id !== "undefined" && o.id === v.id) ||
            (typeof o?.value !== "undefined" && typeof v?.value !== "undefined" && o.value === v.value));
        const loading = acLoading[f.name] || false;

        return (
          <Stack key={f.name} spacing={0.5}>
            {f.label ? (
              <Typography variant="body2" color="text.secondary">
                {f.label}
              </Typography>
            ) : null}
            <Autocomplete
              loading={loading}
              options={opts}
              value={value ?? null}
              isOptionEqualToValue={isEq}
              getOptionLabel={getOptionLabel}
              filterOptions={cfg.filterOptions}
              onChange={(_, v) => onFieldChange(f.name, v)}
              renderOption={(props, option, { selected }) => {
                const { key, ...otherProps } = props;
                const optionKey = (option as any)?.id || (option as any)?.value || String(getOptionLabel(option));
                return (
                  <li key={optionKey} {...otherProps}>
                    <Checkbox size="small" style={{ marginRight: 8 }} checked={selected} />
                    {getOptionLabel(option)}
                  </li>
                );
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder={f.placeholder}
                  fullWidth
                  size="small"
                  required={f.required}
                  disabled={disabled}
                />
              )}
              sx={{ flex: 1 }}
            />
            {f.helperText ? (
              <Typography variant="caption" color="text.secondary">
                {f.helperText}
              </Typography>
            ) : null}
          </Stack>
        );
      }

      default:
        return null;
    }
  };

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={busy ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 420, md: "36vw" }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Box sx={{ width: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" px={2} py={1.5}>
          <Typography variant="h6">{title}</Typography>
          <IconButton onClick={busy ? undefined : onClose} aria-label="Закрыть">
            <CloseOutlined />
          </IconButton>
        </Stack>
        <Divider />

        <Box px={2} py={2} sx={{ flex: 1, overflowY: "auto" }}>
          <Stack spacing={2}>
            {fieldsConfig.map((f) => renderField(f))}
          </Stack>
        </Box>

        <Divider />

        <Box px={2} py={1.5} display="flex" justifyContent="space-between" gap={1.5}>
          <Box>
            {mode === "edit" ? (
              <AppButton
                color="error"
                onClick={() => setConfirmOpen(true)}
                disabled={busy || loadingRecord || !recordId}
              >
                Удалить
              </AppButton>
            ) : null}
          </Box>
          <Box>
            <AppButton onClick={onClose} disabled={busy}>Отмена</AppButton>
            <AppButton
              onClick={handleSubmit}
              variant="contained"
              disabled={!canSubmit}
              sx={{ ml: 1 }}
            >
              {busy ? (
                <Stack direction="row" alignItems="center" spacing={1}>
                  <CircularProgress size={18} />
                  <span>Сохранение…</span>
                </Stack>
              ) : (
                submitLabel
              )}
            </AppButton>
          </Box>
        </Box>
      </Box>

      {/* Диалог подтверждения удаления */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Подтверждение удаления</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Вы уверены, что хотите удалить эту запись?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <AppButton onClick={() => setConfirmOpen(false)}>Отмена</AppButton>
          <AppButton onClick={handleDelete} color="error" variant="contained" disabled={busy}>
            Удалить
          </AppButton>
        </DialogActions>
      </Dialog>

      {/* Уведомления */}
      <Snackbar
        open={snack.open}
        autoHideDuration={3000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          severity={snack.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </Drawer>
  );
};

export default DataFormSidebar;
