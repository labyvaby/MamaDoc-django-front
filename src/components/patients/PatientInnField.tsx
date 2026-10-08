/**
 * PatientInnField.tsx
 * ИНН пациента и всё, что к нему относится для формы 5 прививок: причина
 * отсутствия ИНН и отметка «Приезжий». ИНН КР содержит пол и дату рождения —
 * при вводе полного номера они заполняются сами, если ещё пусты.
 */
import React from "react";
import {
  Box,
  Checkbox,
  FormControlLabel,
  InputAdornment,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import NumbersOutlined from "@mui/icons-material/NumbersOutlined";
import { parseKgPin } from "../../utils/kgPin";
import { INN_ABSENT_REASON_OPTIONS } from "../../pages/vaccinations/meta";
import type { InnAbsentReason, PatientGender } from "../../api/patients";
import { FieldLabel } from "../ui";
import { useT } from "../../i18n/VerticalProvider";

const INN_LENGTH = 14;

type Props = {
  inn: string;
  onInnChange: (inn: string) => void;
  innAbsentReason: InnAbsentReason | "";
  onInnAbsentReasonChange: (reason: InnAbsentReason | "") => void;
  isVisitor: boolean;
  onVisitorChange: (value: boolean) => void;
  gender: PatientGender;
  onGenderChange: (gender: PatientGender) => void;
  /** YYYY-MM-DD или "" */
  birth: string;
  onBirthChange: (birth: string) => void;
  disabled?: boolean;
  onEnter?: (e: React.KeyboardEvent) => void;
};

const PatientInnField: React.FC<Props> = ({
  inn,
  onInnChange,
  innAbsentReason,
  onInnAbsentReasonChange,
  isVisitor,
  onVisitorChange,
  gender,
  onGenderChange,
  birth,
  onBirthChange,
  disabled,
  onEnter,
}) => {
  const { t } = useT("patients");
  // Причину спрашиваем по ссылке: ИНН пуст почти у всех, и раскрытый селект
  // занимал строку в каждой карточке. Уже указанную причину показываем сразу.
  const [reasonOpen, setReasonOpen] = React.useState(false);
  const showReason = !inn && (reasonOpen || Boolean(innAbsentReason));

  // Расхождение считаем от текущих значений, а не в момент ввода: исправили
  // пол — подсказка ушла сама.
  const hint = React.useMemo(() => {
    if (inn.length !== INN_LENGTH) return null;
    const pin = parseKgPin(inn);
    if (!pin.ok) return pin.error;
    if (gender !== "unknown" && gender !== pin.gender) return t("form.innGenderMismatch");
    if (birth && birth !== pin.birthDate) return t("form.innBirthMismatch");
    return null;
  }, [inn, gender, birth, t]);

  const handleChange = (raw: string) => {
    const next = raw.replace(/[^0-9]/g, "").slice(0, INN_LENGTH);
    onInnChange(next);
    if (next.length < INN_LENGTH) return;
    const pin = parseKgPin(next);
    if (!pin.ok) return;
    onInnAbsentReasonChange("");
    if (gender === "unknown") onGenderChange(pin.gender);
    if (!birth) onBirthChange(pin.birthDate);
  };

  return (
    <Stack spacing={0.5}>
      <FieldLabel
        end={
          <Typography variant="caption" color="text.disabled">
            {t("form.innHint")}
          </Typography>
        }
      >
        {t("form.inn")}
      </FieldLabel>
      <TextField
        value={inn}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={onEnter}
        fullWidth
        size="small"
        placeholder="00000000000000"
        disabled={disabled}
        inputProps={{ inputMode: "numeric" }}
        error={Boolean(hint)}
        helperText={hint ?? undefined}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <NumbersOutlined fontSize="small" color="disabled" />
            </InputAdornment>
          ),
          endAdornment:
            inn.length === INN_LENGTH && !hint ? (
              <InputAdornment position="end">
                <CheckCircleOutlined fontSize="small" color="success" />
              </InputAdornment>
            ) : inn ? (
              <InputAdornment position="end">
                <Typography
                  variant="caption"
                  color="text.disabled"
                  sx={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {inn.length}/{INN_LENGTH}
                </Typography>
              </InputAdornment>
            ) : undefined,
        }}
      />
      {showReason && (
        <TextField
          select
          size="small"
          fullWidth
          label={t("form.innAbsentReason")}
          value={innAbsentReason}
          onChange={(e) => onInnAbsentReasonChange(e.target.value as InnAbsentReason | "")}
          disabled={disabled}
          sx={{ mt: 0.75 }}
        >
          <MenuItem value="">
            <em>{t("form.innAbsentNone")}</em>
          </MenuItem>
          {INN_ABSENT_REASON_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
      )}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          columnGap: 2,
        }}
      >
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={isVisitor}
              onChange={(e) => onVisitorChange(e.target.checked)}
              disabled={disabled}
            />
          }
          label={<Typography variant="body2">{t("form.visitor")}</Typography>}
          sx={{ mr: 0 }}
        />
        {!inn && !showReason && (
          <Link
            component="button"
            type="button"
            variant="body2"
            underline="hover"
            onClick={() => setReasonOpen(true)}
            disabled={disabled}
            sx={{ fontWeight: 600 }}
          >
            {t("form.innAbsentLink")}
          </Link>
        )}
      </Box>
    </Stack>
  );
};

export default PatientInnField;
