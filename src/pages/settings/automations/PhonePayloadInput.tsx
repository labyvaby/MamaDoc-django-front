import React from "react";
import { InputAdornment, TextField } from "@mui/material";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";

import { PhoneCountryCodeSelect } from "../../../components/ui";
import { usePhoneLocalInput } from "../../../hooks/usePhoneLocalInput";
import {
  DEFAULT_PHONE_COUNTRY_CODE,
  composePhone,
  formatPhoneLocalDisplay,
  getPhoneLocalMaxLength,
  handlePhonePaste,
  parsePhone,
  type PhoneCountryCode,
} from "../../../utility/phone";

export interface PhonePayloadInputProps {
  label: string;
  helperText?: string;
  /** Номер целиком, как он лежит в payload события («+996700000001»). */
  value: string;
  onChange: (phone: string) => void;
  disabled?: boolean;
}

/**
 * Телефон в данных пробного прогона — тем же полем, что и в карточке пациента.
 *
 * Прогон проверяет реальную отправку, поэтому и номер должен вводиться как
 * везде в системе: с выбором страны, маской и сохранением позиции курсора.
 * Наружу отдаётся склеенный номер — именно в таком виде он приходит в payload
 * настоящего события.
 */
export const PhonePayloadInput: React.FC<PhonePayloadInputProps> = ({
  label,
  helperText,
  value,
  onChange,
  disabled = false,
}) => {
  const parsed = parsePhone(value);
  const [countryCode, setCountryCode] = React.useState<PhoneCountryCode>(
    parsed.countryCode || DEFAULT_PHONE_COUNTRY_CODE,
  );
  const local = parsed.local;

  const setLocal = React.useCallback(
    (digits: string) => onChange(composePhone(countryCode, digits) ?? ""),
    [countryCode, onChange],
  );

  const changeCountry = React.useCallback(
    (code: PhoneCountryCode) => {
      setCountryCode(code);
      // Код страны — часть значения: без пересборки в payload остался бы
      // номер со старым кодом, и прогон проверил бы не то, что показан.
      if (local) onChange(composePhone(code, local) ?? "");
    },
    [local, onChange],
  );

  const phoneInput = usePhoneLocalInput(countryCode, local, setLocal, setCountryCode);
  const complete = local.length === getPhoneLocalMaxLength(countryCode);

  return (
    <TextField
      size="small"
      fullWidth
      label={label}
      helperText={helperText}
      disabled={disabled}
      value={formatPhoneLocalDisplay(countryCode, local)}
      inputRef={phoneInput.inputRef}
      onChange={phoneInput.onChange}
      onKeyDown={phoneInput.onKeyDown}
      onPaste={(e) =>
        handlePhonePaste(e, countryCode, (code, digits) => {
          setCountryCode(code);
          onChange(composePhone(code, digits) ?? "");
        })
      }
      InputProps={{
        startAdornment: (
          <InputAdornment position="start" sx={{ mr: 1, ml: "-14px" }}>
            <PhoneCountryCodeSelect value={countryCode} onChange={changeCountry} />
          </InputAdornment>
        ),
        endAdornment: complete ? (
          <InputAdornment position="end">
            <CheckCircleOutlined fontSize="small" color="success" />
          </InputAdornment>
        ) : undefined,
      }}
      inputProps={{ inputMode: "tel", pattern: "[0-9]*" }}
      placeholder={
        getPhoneLocalMaxLength(countryCode) === 10 ? "XXX XXX XXXX" : "XXX XXX XXX"
      }
    />
  );
};

export default PhonePayloadInput;
