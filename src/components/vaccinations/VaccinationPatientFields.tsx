import React from "react";
import {
  Box,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import dayjs, { type Dayjs } from "dayjs";

import { AppButton, CustomDatePicker } from "../ui";
import { INN_ABSENT_REASON_OPTIONS } from "../../pages/vaccinations/meta";
import type { InnAbsentReason } from "../../api/vaccinations";
import {
  ageLabel,
  applyInnToPatientDraft,
  patientGaps,
  type PatientDraft,
} from "./patientGaps";

type Props = {
  value: PatientDraft;
  onChange: (next: PatientDraft) => void;
  /** Ключи недостающих полей из ответа бэка ("patient.gender" и т. п.). */
  highlight?: string[];
  /** Ошибки бэка по полям пациента (400 при расхождении с ИНН). */
  serverErrors?: Partial<Record<"gender" | "birthDate" | "inn", string>>;
};

const GENDER_LABEL: Record<string, string> = { male: "Мужской", female: "Женский" };

/**
 * Пол, дата рождения и ИНН ребёнка — без них прививку не оформить. Заполненное
 * показывается строкой, пустое — полями ввода; ИНН сам заполняет пол и дату.
 */
const VaccinationPatientFields: React.FC<Props> = ({ value, onChange, highlight = [], serverErrors }) => {
  const gaps = patientGaps(value);
  const [editing, setEditing] = React.useState(gaps.length > 0);
  const [innConflict, setInnConflict] = React.useState<string | null>(null);
  const [noInn, setNoInn] = React.useState(Boolean(value.innAbsentReason) && !value.inn);

  const flagged = (key: string) => highlight.includes(`patient.${key}`);

  if (!editing) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography variant="body2">
          {GENDER_LABEL[value.gender] ?? "Пол не указан"}
          {" · "}
          {value.birthDate
            ? `${dayjs(value.birthDate).format("DD.MM.YYYY")} (${ageLabel(value.birthDate)})`
            : "дата рождения не указана"}
          {" · "}
          {value.inn
            ? `ИНН ${value.inn}`
            : INN_ABSENT_REASON_OPTIONS.find((o) => o.value === value.innAbsentReason)?.label ??
              "ИНН не указан"}
        </Typography>
        <AppButton size="small" variant="text" onClick={() => setEditing(true)}>
          Изменить
        </AppButton>
      </Box>
    );
  }

  const handleInn = (raw: string) => {
    const inn = raw.replace(/\D/g, "").slice(0, 14);
    if (inn.length < 14) {
      setInnConflict(null);
      onChange({ ...value, inn });
      return;
    }
    const res = applyInnToPatientDraft(value, inn);
    setInnConflict(res.conflict);
    onChange(res.draft);
  };

  return (
    <Stack spacing={1.5}>
      <Box>
        <Typography variant="caption" color={flagged("gender") ? "error" : "text.secondary"}>
          Пол
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          fullWidth
          value={value.gender === "unknown" ? null : value.gender}
          onChange={(_, g) => g && onChange({ ...value, gender: g })}
          sx={flagged("gender") ? { outline: 1, outlineColor: "error.main", borderRadius: 1 } : undefined}
        >
          <ToggleButton value="female">Женский</ToggleButton>
          <ToggleButton value="male">Мужской</ToggleButton>
        </ToggleButtonGroup>
        {serverErrors?.gender && (
          <Typography variant="caption" color="error">
            {serverErrors.gender}
          </Typography>
        )}
      </Box>
      <CustomDatePicker
        label="Дата рождения"
        value={value.birthDate ? dayjs(value.birthDate) : null}
        onChange={(v) => {
          const d = v as Dayjs | null;
          onChange({ ...value, birthDate: d && d.isValid() ? d.format("YYYY-MM-DD") : null });
        }}
        maxDate={dayjs()}
        slotProps={{
          textField: {
            fullWidth: true,
            size: "small",
            error: flagged("birthDate") || Boolean(serverErrors?.birthDate),
            helperText: serverErrors?.birthDate
              ?? (value.birthDate ? `Возраст: ${ageLabel(value.birthDate)}` : undefined),
          },
        }}
      />
      {!noInn ? (
        <TextField
          label="ИНН"
          size="small"
          fullWidth
          value={value.inn}
          onChange={(e) => handleInn(e.target.value)}
          inputProps={{ inputMode: "numeric", maxLength: 14 }}
          error={Boolean(innConflict) || flagged("inn") || Boolean(serverErrors?.inn)}
          helperText={innConflict ?? serverErrors?.inn ?? "14 цифр; пол и дата рождения заполнятся сами"}
        />
      ) : (
        <TextField
          select
          label="Почему нет ИНН"
          size="small"
          fullWidth
          value={value.innAbsentReason}
          error={flagged("inn")}
          onChange={(e) =>
            onChange({ ...value, innAbsentReason: e.target.value as InnAbsentReason })
          }
        >
          {INN_ABSENT_REASON_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
      )}
      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={noInn}
            onChange={(e) => {
              setNoInn(e.target.checked);
              setInnConflict(null);
              onChange(
                e.target.checked
                  ? { ...value, inn: "", innAbsentReason: value.innAbsentReason || "newborn" }
                  : { ...value, innAbsentReason: "" },
              );
            }}
          />
        }
        label="Нет ИНН"
      />
    </Stack>
  );
};

export default VaccinationPatientFields;
