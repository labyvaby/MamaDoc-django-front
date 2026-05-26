import React from "react";
import { TextField, MenuItem } from "@mui/material";
import { PHONE_COUNTRY_CODES, type PhoneCountryCode } from "../../utility/phone";

export interface PhoneCountryCodeSelectProps {
  value: PhoneCountryCode;
  onChange: (code: PhoneCountryCode) => void;
  disabled?: boolean;
}

/**
 * Единый селект кода страны для телефонных полей.
 * Сейчас поддерживает только +996 и +7.
 */
export const PhoneCountryCodeSelect: React.FC<PhoneCountryCodeSelectProps> = ({
  value,
  onChange,
  disabled,
}) => {
  return (
    <TextField
      select
      value={value}
      onChange={(e) => onChange(e.target.value as PhoneCountryCode)}
      disabled={disabled}
      size="small"
      sx={{
        minWidth: 96,
        maxWidth: 110,
        '& .MuiInputBase-input': {
          paddingLeft: '15px',
        }
      }}
    >
      {PHONE_COUNTRY_CODES.map((code) => (
        <MenuItem key={code} value={code}>
          {code}
        </MenuItem>
      ))}
    </TextField>
  );
};

export default PhoneCountryCodeSelect;

