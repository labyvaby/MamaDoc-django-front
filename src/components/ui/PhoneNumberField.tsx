import React from "react";
import { InputAdornment, Stack, TextField, Typography } from "@mui/material";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import { PhoneCountryCodeSelect } from "./PhoneCountryCodeSelect";
import { usePhoneLocalInput } from "../../hooks/usePhoneLocalInput";
import {
  formatPhoneLocalDisplay,
  getPhoneLocalMaxLength,
  handlePhonePaste,
  type PhoneCountryCode,
} from "../../utility/phone";

export interface PhoneNumberFieldProps {
  label: string;
  countryCode: PhoneCountryCode;
  phone: string;
  onCountryCodeChange: (value: PhoneCountryCode) => void;
  onPhoneChange: (value: string) => void;
  disabled?: boolean;
  helperText?: React.ReactNode;
  onEnter?: (event: React.KeyboardEvent) => void;
}

/** Standard phone input shared by patient and client forms. */
export default function PhoneNumberField({
  label,
  countryCode,
  phone,
  onCountryCodeChange,
  onPhoneChange,
  disabled = false,
  helperText,
  onEnter,
}: PhoneNumberFieldProps) {
  const input = usePhoneLocalInput(countryCode, phone, onPhoneChange, onCountryCodeChange);

  return (
    <Stack spacing={0.5}>
      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      <TextField
        value={formatPhoneLocalDisplay(countryCode, phone)}
        inputRef={input.inputRef}
        onChange={input.onChange}
        onPaste={(event) =>
          handlePhonePaste(event, countryCode, (code, local) => {
            onCountryCodeChange(code);
            onPhoneChange(local);
          })
        }
        onKeyDown={(event) => {
          input.onKeyDown(event);
          onEnter?.(event);
        }}
        fullWidth
        size="small"
        disabled={disabled}
        helperText={helperText}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start" sx={{ mr: 1, ml: "-14px" }}>
              <PhoneCountryCodeSelect value={countryCode} onChange={onCountryCodeChange} />
            </InputAdornment>
          ),
          endAdornment:
            phone.length === getPhoneLocalMaxLength(countryCode) ? (
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
    </Stack>
  );
}
