import React from "react";
import {
  Autocomplete,
  Button,
  Checkbox,
  FormControlLabel,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import BoyOutlined from "@mui/icons-material/BoyOutlined";
import GirlOutlined from "@mui/icons-material/GirlOutlined";
import dayjs from "dayjs";

import { CustomDatePicker } from "../../ui";
import type { DjangoPatient } from "../../../api/patients";
import DjangoAddPatientDrawer from "../../patients/DjangoAddPatientDrawer";

type Props = {
  patient: DjangoPatient | null;
  inn: string;
  birthDate: string | null;
  gender: string;
  disabled: boolean;
  onSelect: (patient: DjangoPatient | null) => void;
  onInnChange: (value: string) => void;
  onBirthDateChange: (value: string | null) => void;
  onGenderChange: (value: string) => void;
  /** Согласие пациента на обработку персональных данных. */
  consent: boolean;
  onConsentChange: (value: boolean) => void;
  /** SMS от лаборатории о готовности — как галочка в интерфейсе ЛИС. */
  receiverSms: boolean;
  onReceiverSmsChange: (value: boolean) => void;
  /** Почта для результатов — в карте пациента её нет, спрашивается здесь. */
  resultEmail: string;
  onResultEmailChange: (value: string) => void;
  /**
   * План (Task 9) не включал эти четыре поля в пропсы секции: автокомплит
   * ищет через `searchPatients`, а по правилу проекта (см. `PaymentSection`,
   * Task 8) секции сами не делают запросов. Поиск с debounce и
   * `AbortController` живёт в `LabIntakeDrawer` (Task 10) — так же, как в
   * `DjangoSaleFormDrawer` и `DjangoAddAppointmentDrawer` — и приходит сюда
   * уже готовым результатом.
   */
  searchQuery: string;
  searchResults: DjangoPatient[];
  searchLoading: boolean;
  onSearchChange: (value: string) => void;
};

/** Пациент без имени в карте — не должен превращаться в пустую строку опции. */
function patientLabel(patient: DjangoPatient): string {
  return patient.fullName || "Без имени";
}

/**
 * Выбор пациента плюс дозаполнение карты (ИНН, дата рождения, пол).
 *
 * Три поля дозаполнения показываются, только когда соответствующего значения
 * нет **в карте** (`patient.inn` и т.д.) — не в текущем вводе (`inn` и
 * т.д.): иначе поле пропадало бы прямо во время набора первого символа.
 * Сохраняет карту не секция, а дровер отдельным `PATCH` до приёма.
 */
const PatientSection: React.FC<Props> = ({
  patient,
  inn,
  birthDate,
  gender,
  disabled,
  onSelect,
  onInnChange,
  onBirthDateChange,
  onGenderChange,
  consent,
  onConsentChange,
  receiverSms,
  onReceiverSmsChange,
  resultEmail,
  onResultEmailChange,
  searchQuery,
  searchResults,
  searchLoading,
  onSearchChange,
}) => {
  // Выбранный пациент обязан остаться виден в списке опций, даже если
  // текущий поисковый запрос его больше не возвращает (например, очистили
  // поле после выбора) — иначе Autocomplete не находит value среди options
  // и показывает пустое поле вместо имени.
  const options = React.useMemo(() => {
    if (!patient || searchResults.some((p) => p.id === patient.id))
      return searchResults;
    return [patient, ...searchResults];
  }, [patient, searchResults]);

  const needsInn = !!patient && !patient.inn;
  const needsBirthDate = !!patient && !patient.birthDate;
  const needsGender = !!patient && patient.gender === "unknown";
  const needsAnything = needsInn || needsBirthDate || needsGender;

  const [addOpen, setAddOpen] = React.useState(false);
  // Поле почты — по галочке: у большинства пациентов её нет, а пустое поле
  // занимало строку. Восстановленный черновик с адресом раскрывает его сам.
  const [emailAsked, setEmailAsked] = React.useState(false);
  const emailWanted = emailAsked || resultEmail !== "";
  const setEmailWanted = setEmailAsked;

  return (
    <Stack spacing={1.25}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ fontWeight: 500 }}
        >
          Пациент *
        </Typography>
        <Button
          size="small"
          disabled={disabled}
          onClick={() => setAddOpen(true)}
        >
          + Добавить пациента
        </Button>
      </Stack>

      <Autocomplete
        options={options}
        value={patient}
        onChange={(_, value) => onSelect(value)}
        inputValue={searchQuery}
        onInputChange={(_, value) => onSearchChange(value)}
        getOptionLabel={patientLabel}
        // Ключ — id: у однофамильцев с общим телефоном (дети одной
        // семьи) подписи совпадают, см. ту же правку в ReferralSection.
        getOptionKey={(option) => option.id}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        filterOptions={(x) => x}
        loading={searchLoading}
        disabled={disabled}
        noOptionsText={
          searchQuery.trim().length < 2
            ? "Введите не менее 2 символов"
            : "Ничего не найдено"
        }
        renderOption={(props, option) => (
          <li {...props} key={option.id}>
            <Stack>
              <Typography variant="body2">{patientLabel(option)}</Typography>
              {option.phone && (
                <Typography variant="caption" color="text.secondary">
                  {option.phone}
                </Typography>
              )}
            </Stack>
          </li>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            size="small"
            placeholder="ФИО или телефон пациента"
          />
        )}
      />

      {needsAnything && (
        <Stack spacing={1.5}>
          <Typography variant="caption" color="text.secondary">
            Без этих данных заказ не уйдёт в лабораторию, а референсные
            интервалы результатов зависят от возраста и пола.
          </Typography>

          {needsInn && (
            <Stack spacing={0.5}>
              <Typography
                variant="body2"
                color="text.secondary"
                fontWeight={600}
              >
                ИНН
              </Typography>
              <TextField
                size="small"
                fullWidth
                value={inn}
                onChange={(e) => onInnChange(e.target.value)}
                disabled={disabled}
                placeholder="14 цифр"
              />
            </Stack>
          )}

          {needsBirthDate && (
            <Stack spacing={0.5}>
              <Typography
                variant="body2"
                color="text.secondary"
                fontWeight={600}
              >
                Дата рождения
              </Typography>
              <CustomDatePicker
                value={birthDate ? dayjs(birthDate) : null}
                onChange={(value) =>
                  onBirthDateChange(
                    value && value.isValid() ? value.format("YYYY-MM-DD") : null
                  )
                }
                disabled={disabled}
                slotProps={{ textField: { size: "small", fullWidth: true } }}
              />
            </Stack>
          )}

          {needsGender && (
            <Stack spacing={0.5}>
              <Typography
                variant="body2"
                color="text.secondary"
                fontWeight={600}
              >
                Пол
              </Typography>
              <ToggleButtonGroup
                value={gender === "male" || gender === "female" ? gender : null}
                exclusive
                onChange={(_, value) =>
                  onGenderChange((value as string | null) ?? "unknown")
                }
                disabled={disabled}
                fullWidth
                size="small"
                // Как переключатель день/ночь в форме приёма: выбранный
                // сегмент залит основным цветом, а не серым.
                sx={{
                  bgcolor: "action.hover",
                  borderRadius: "10px",
                  p: "3px",
                  border: "none",
                  "& .MuiToggleButton-root": {
                    flex: 1,
                    border: "none",
                    borderRadius: "6px !important",
                    py: 0.75,
                    gap: 0.5,
                    textTransform: "none",
                    transition: "all 0.2s ease-in-out",
                    bgcolor: "transparent",
                    color: "text.secondary",
                    "&:hover": { bgcolor: "action.selected" },
                    "&.Mui-selected": {
                      bgcolor: "primary.main",
                      color: "primary.contrastText",
                      fontWeight: 600,
                      "&:hover": { bgcolor: "primary.dark" },
                    },
                  },
                }}
              >
                <ToggleButton value="male">
                  <BoyOutlined fontSize="small" />
                  Мужской
                </ToggleButton>
                <ToggleButton value="female">
                  <GirlOutlined fontSize="small" />
                  Женский
                </ToggleButton>
              </ToggleButtonGroup>
            </Stack>
          )}
        </Stack>
      )}

      <FormControlLabel
        sx={{ alignItems: "flex-start", ml: 0 }}
        control={
          <Checkbox
            size="small"
            checked={consent}
            onChange={(event) => onConsentChange(event.target.checked)}
            disabled={disabled}
            sx={{ pt: 0.25 }}
          />
        }
        label={
          <Typography
            variant="caption"
            sx={{ lineHeight: 1.3, display: "block" }}
          >
            Пациент дал согласие на обработку персональных данных и передачу их
            в лабораторию
          </Typography>
        }
      />

      {/* Уведомления о готовности шлёт сама лаборатория: SMS — по телефону
          из карты (orderDTO.@receiver_sms), письмо — на почту, которой в
          карте пациента нет, поэтому она спрашивается при приёме. */}
      {patient && (
        <Stack spacing={0.5}>
          <Stack direction="row" flexWrap="wrap" useFlexGap columnGap={2}>
            <FormControlLabel
              sx={{ ml: 0, mr: 0 }}
              control={
                <Checkbox
                  size="small"
                  checked={receiverSms && !!patient.phone}
                  onChange={(event) =>
                    onReceiverSmsChange(event.target.checked)
                  }
                  disabled={disabled || !patient.phone}
                  sx={{ py: 0.25 }}
                />
              }
              label={
                <Typography variant="caption" sx={{ lineHeight: 1.3 }}>
                  SMS о готовности
                  {patient.phone ? ` на ${patient.phone}` : " — нет телефона"}
                </Typography>
              }
            />
            <FormControlLabel
              sx={{ ml: 0, mr: 0 }}
              control={
                <Checkbox
                  size="small"
                  checked={emailWanted}
                  onChange={(event) => {
                    setEmailWanted(event.target.checked);
                    if (!event.target.checked) onResultEmailChange("");
                  }}
                  disabled={disabled}
                  sx={{ py: 0.25 }}
                />
              }
              label={
                <Typography variant="caption" sx={{ lineHeight: 1.3 }}>
                  Результаты на почту
                </Typography>
              }
            />
          </Stack>
          {emailWanted && (
            <TextField
              size="small"
              fullWidth
              type="email"
              placeholder="email@example.com"
              autoFocus={resultEmail === ""}
              value={resultEmail}
              onChange={(event) => onResultEmailChange(event.target.value)}
              disabled={disabled}
            />
          )}
        </Stack>
      )}
      {/* Тот же дровер, что в форме приёма: пациент с улицы без карты —
          обычный случай у стойки лаборатории. */}
      <DjangoAddPatientDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(created) => {
          onSelect(created);
          setAddOpen(false);
        }}
      />
    </Stack>
  );
};

export default PatientSection;
