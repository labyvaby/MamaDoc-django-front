import React from "react";
import { Checkbox, FormControlLabel, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import ArrowUpwardOutlined from "@mui/icons-material/ArrowUpwardOutlined";
import ArrowDownwardOutlined from "@mui/icons-material/ArrowDownwardOutlined";

import { AppButton } from "../ui";
import { DEAL_CUSTOM_FIELD_TYPES, type DealCustomField, type DealCustomFieldType } from "../../api/deals";
import { useT } from "../../i18n/VerticalProvider";

interface CustomFieldsEditorProps {
  fields: DealCustomField[];
  onSave: (fields: DealCustomField[]) => void;
  saving?: boolean;
}

/** Код из названия: латиница/цифры/«_», чтобы не заставлять придумывать его руками. */
function slugify(label: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  const raw = label
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return /^[a-z]/.test(raw) ? raw : raw ? `f_${raw}`.slice(0, 32) : "";
}

/**
 * Редактор схемы дополнительных полей воронки (Настройки → Воронка).
 *
 * Черновик правится локально и уходит одним PATCH по «Сохранить»: поля
 * связаны между собой (порядок, уникальные коды), сохранять каждую букву
 * отдельным запросом было бы шумно. Код генерируется из названия и
 * фиксируется после первого сохранения — по нему хранятся значения у сделок.
 */
const CustomFieldsEditor: React.FC<CustomFieldsEditorProps> = ({ fields, onSave, saving = false }) => {
  const { t } = useT("deals");
  const [draft, setDraft] = React.useState<DealCustomField[]>(fields);
  const savedCodes = React.useMemo(() => new Set(fields.map((f) => f.code)), [fields]);
  React.useEffect(() => setDraft(fields), [fields]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(fields);
  const update = (index: number, patch: Partial<DealCustomField>) =>
    setDraft((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  const move = (index: number, delta: number) =>
    setDraft((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const valid = draft.every(
    (f) => f.code && f.label.trim() && (f.type !== "select" || f.options.some((o) => o.trim())),
  );

  return (
    <Stack gap={1}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
        <Stack>
          <Typography variant="subtitle2">{t("settings.customFields")}</Typography>
          <Typography variant="caption" color="text.secondary">
            {t("settings.customFieldsHint")}
          </Typography>
        </Stack>
        <AppButton
          size="small"
          startIcon={<AddOutlined />}
          onClick={() =>
            setDraft((prev) => [...prev, { code: "", label: "", type: "text", options: [], required: false }])
          }
        >
          {t("settings.customFieldAdd")}
        </AppButton>
      </Stack>

      {draft.map((field, index) => {
        const locked = savedCodes.has(field.code) && field.code !== "";
        return (
          <Stack
            key={index}
            direction="row"
            alignItems="flex-start"
            gap={1}
            flexWrap="wrap"
            sx={{ p: 1, borderRadius: 1.5, bgcolor: "action.hover" }}
          >
            <TextField
              size="small"
              label={t("settings.customFieldLabel")}
              value={field.label}
              onChange={(e) => {
                const label = e.target.value;
                update(index, locked ? { label } : { label, code: slugify(label) });
              }}
              sx={{ flex: "1 1 180px" }}
            />
            <TextField
              select
              size="small"
              label={t("settings.customFieldType")}
              value={field.type}
              onChange={(e) => update(index, { type: e.target.value as DealCustomFieldType })}
              sx={{ width: 150 }}
            >
              {DEAL_CUSTOM_FIELD_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  {t(`settings.customFieldType_${type}`)}
                </MenuItem>
              ))}
            </TextField>
            {field.type === "select" ? (
              <TextField
                size="small"
                label={t("settings.customFieldOptions")}
                placeholder="Instagram, 2ГИС, Сарафан"
                value={field.options.join(", ")}
                onChange={(e) => update(index, { options: e.target.value.split(",").map((o) => o.trimStart()) })}
                onBlur={(e) =>
                  update(index, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })
                }
                sx={{ flex: "1 1 220px" }}
              />
            ) : null}
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={field.required}
                  onChange={(e) => update(index, { required: e.target.checked })}
                />
              }
              label={<Typography variant="body2">{t("settings.customFieldRequired")}</Typography>}
              sx={{ ml: 0 }}
            />
            <Stack direction="row" alignItems="center" sx={{ ml: "auto" }}>
              <Tooltip title={field.code || ""}>
                <Typography variant="caption" color="text.disabled" sx={{ mr: 1, fontFamily: "monospace" }}>
                  {field.code || "—"}
                </Typography>
              </Tooltip>
              <IconButton size="small" onClick={() => move(index, -1)} disabled={index === 0}>
                <ArrowUpwardOutlined fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => move(index, 1)} disabled={index === draft.length - 1}>
                <ArrowDownwardOutlined fontSize="small" />
              </IconButton>
              <Tooltip title={locked ? t("settings.customFieldDeleteHint") : ""}>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => setDraft((prev) => prev.filter((_f, i) => i !== index))}
                >
                  <DeleteOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>
        );
      })}

      {draft.length === 0 ? (
        <Typography variant="body2" color="text.disabled">
          {t("settings.customFieldsEmpty")}
        </Typography>
      ) : null}

      {dirty ? (
        <Stack direction="row" gap={1}>
          <AppButton size="small" variant="contained" onClick={() => onSave(draft)} loading={saving} disabled={!valid}>
            {t("settings.save")}
          </AppButton>
          <AppButton size="small" variant="text" onClick={() => setDraft(fields)} disabled={saving}>
            {t("settings.cancel")}
          </AppButton>
        </Stack>
      ) : null}
    </Stack>
  );
};

export default CustomFieldsEditor;
