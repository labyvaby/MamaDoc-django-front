import React from "react";
import {
  Alert,
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AutoFixHighOutlined from "@mui/icons-material/AutoFixHighOutlined";

import { AppButton } from "../../../components/ui/AppButton";
import { useT } from "../../../i18n/VerticalProvider";
import {
  declineTerm,
  type DeclensionWarning,
} from "../../../i18n/declension";
import {
  FORM_KEYS,
  type FormKey,
  type Gender,
  type TermForms,
  type TermKey,
} from "../../../i18n/types";

/** Падежи в порядке школьной таблицы; множественное — те же ключи с Pl. */
const CASE_ROWS: { single: FormKey; plural: FormKey }[] = [
  { single: "nom", plural: "nomPl" },
  { single: "gen", plural: "genPl" },
  { single: "dat", plural: "datPl" },
  { single: "acc", plural: "accPl" },
  { single: "ins", plural: "insPl" },
  { single: "pre", plural: "prePl" },
];

const GENDERS: Gender[] = ["m", "f", "n"];

export type TermEditorDialogProps = {
  open: boolean;
  /** Ключ термина — нужен только для заголовка и подсказки. */
  termKey: TermKey;
  /** Форма из профиля вертикали: эталон сброса и источник одушевлённости. */
  base: TermForms;
  /** Текущее значение термина (оверрайд организации либо форма профиля). */
  value: TermForms;
  onClose: () => void;
  onApply: (forms: TermForms) => void;
  /** Вернуть термин к профилю вертикали (снять оверрайд). */
  onReset: () => void;
};

/**
 * Редактор одного термина: слово в именительном падеже → двенадцать словоформ.
 *
 * Формы выводятся автоматически (см. i18n/declension.ts), но остаются
 * редактируемыми: движок не знает ударения и чередований в корне, поэтому
 * последнее слово всегда за человеком. Предупреждения показывают, где именно
 * стоит присмотреться, а предпросмотр — как формы выглядят в живых фразах.
 */
export const TermEditorDialog: React.FC<TermEditorDialogProps> = ({
  open,
  termKey,
  base,
  value,
  onClose,
  onApply,
  onReset,
}) => {
  const { t } = useT("settings");

  // Одушевлённость решает винительный падеж («добавить пациента», но
  // «добавить приём»). В глоссарии её нет отдельным полем — она видна по
  // совпадению винительного с родительным в форме профиля и наследуется:
  // слово меняется, а роль сущности в интерфейсе остаётся прежней.
  const animate = base.acc === base.gen && base.gender !== "n";

  const [nominative, setNominative] = React.useState(value.nom);
  const [gender, setGender] = React.useState<Gender>(value.gender);
  const [forms, setForms] = React.useState<TermForms>(value);
  const [warnings, setWarnings] = React.useState<DeclensionWarning[]>([]);
  const [touched, setTouched] = React.useState(false);

  // Диалог монтируется один раз на все термины — синхронизируем черновик
  // при каждом открытии, иначе в нём останется предыдущий термин.
  React.useEffect(() => {
    if (!open) return;
    setNominative(value.nom);
    setGender(value.gender);
    setForms(value);
    setWarnings([]);
    setTouched(false);
  }, [open, termKey, value]);

  const recalc = (word: string, nextGender: Gender) => {
    const result = declineTerm(word, { gender: nextGender, animate });
    setForms(result.forms);
    setWarnings(result.warnings);
    setTouched(true);
  };

  const handleNominative = (word: string) => {
    setNominative(word);
    recalc(word, gender);
  };

  const handleGender = (nextGender: Gender) => {
    setGender(nextGender);
    recalc(nominative, nextGender);
  };

  const handleFormChange = (key: FormKey, next: string) => {
    setForms((prev) => ({ ...prev, [key]: next }));
    setTouched(true);
    if (key === "nom") setNominative(next);
  };

  const filled = FORM_KEYS.every((key) => forms[key].trim() !== "");
  const changed =
    touched &&
    (forms.gender !== value.gender ||
      FORM_KEYS.some((key) => forms[key] !== value[key]));
  const isOverridden = FORM_KEYS.some((key) => value[key] !== base[key]);

  const handleApply = () => {
    const trimmed = { gender } as TermForms;
    for (const key of FORM_KEYS) trimmed[key] = forms[key].trim();
    onApply(trimmed);
  };

  // Предпросмотр строится на живых фразах интерфейса: именно в них видно,
  // что «Карта клиент» — это ошибка, а «Карта клиента» — нет.
  const previews = [
    t("terminology.preview.add", { word: forms.acc }),
    t("terminology.preview.card", { word: forms.gen }),
    t("terminology.preview.all", { word: forms.nomPl }),
    t("terminology.preview.count", { word: forms.genPl }),
  ];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Typography component="div" variant="h6" fontWeight={600}>
          {t(`terminology.terms.${termKey}.label`)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t(`terminology.terms.${termKey}.hint`)}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField
            label={t("terminology.editor.nominativeLabel")}
            helperText={t("terminology.editor.nominativeHint")}
            value={nominative}
            onChange={(e) => handleNominative(e.target.value)}
            size="small"
            fullWidth
            autoFocus
          />

          <Box>
            <Typography variant="caption" color="text.secondary">
              {t("terminology.editor.genderLabel")}
            </Typography>
            <RadioGroup
              row
              value={gender}
              onChange={(e) => handleGender(e.target.value as Gender)}
            >
              {GENDERS.map((g) => (
                <FormControlLabel
                  key={g}
                  value={g}
                  control={<Radio size="small" />}
                  label={
                    <Typography variant="body2">
                      {t(`terminology.editor.gender.${g}`)}
                    </Typography>
                  }
                />
              ))}
            </RadioGroup>
            <Typography variant="caption" color="text.secondary">
              {t("terminology.editor.genderHint")}
            </Typography>
          </Box>

          {warnings.length > 0 && (
            <Alert severity="warning" icon={<AutoFixHighOutlined fontSize="small" />}>
              <Stack spacing={0.5}>
                {warnings.map((code) => (
                  <Typography key={code} variant="caption">
                    {t(`terminology.warnings.${code}`)}
                  </Typography>
                ))}
              </Stack>
            </Alert>
          )}

          <Divider textAlign="left">
            <Typography variant="caption" color="text.secondary">
              {t("terminology.editor.formsTitle")}
            </Typography>
          </Divider>

          <Stack spacing={1.25}>
            <Stack direction="row" spacing={1.25}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ flex: 1 }}
              >
                {t("terminology.editor.singular")}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ flex: 1 }}
              >
                {t("terminology.editor.plural")}
              </Typography>
            </Stack>
            {CASE_ROWS.map((row) => (
              <Stack key={row.single} direction="row" spacing={1.25}>
                <TextField
                  label={t(`terminology.cases.${row.single}`)}
                  value={forms[row.single]}
                  onChange={(e) => handleFormChange(row.single, e.target.value)}
                  size="small"
                  fullWidth
                  error={forms[row.single].trim() === ""}
                />
                <TextField
                  label={t(`terminology.cases.${row.single}`)}
                  value={forms[row.plural]}
                  onChange={(e) => handleFormChange(row.plural, e.target.value)}
                  size="small"
                  fullWidth
                  error={forms[row.plural].trim() === ""}
                />
              </Stack>
            ))}
          </Stack>

          <Box>
            <Typography variant="caption" color="text.secondary">
              {t("terminology.editor.previewTitle")}
            </Typography>
            <Stack spacing={0.25} sx={{ mt: 0.5 }}>
              {previews.map((phrase) => (
                <Typography key={phrase} variant="body2">
                  {phrase}
                </Typography>
              ))}
            </Stack>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        {isOverridden && (
          <AppButton color="inherit" onClick={onReset} sx={{ mr: "auto" }}>
            {t("terminology.editor.reset")}
          </AppButton>
        )}
        <AppButton color="inherit" onClick={onClose}>
          {t("common:actions.cancel")}
        </AppButton>
        <AppButton
          variant="contained"
          onClick={handleApply}
          disabled={!filled || !changed}
        >
          {t("common:actions.apply")}
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};

export default TermEditorDialog;
