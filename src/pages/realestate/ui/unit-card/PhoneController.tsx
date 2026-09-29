import React from "react";
import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";

import PhoneNumberField from "../../../../components/ui/PhoneNumberField";
import { composePhone, isPhoneLocalComplete, parsePhone, type PhoneCountryCode } from "../../../../utility/phone";

/**
 * Телефон покупателя в формах карточки — через общий `PhoneNumberField`
 * (код страны, маска, вставка номера с кодом). В форме хранится полный номер
 * E.164 («+996700000104»), как его принимает и отдаёт бэк.
 */
export function PhoneController<T extends FieldValues>({ control, name, label, requiredMessage }: {
  control: Control<T>;
  name: Path<T>;
  label: string;
  requiredMessage: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      rules={{
        validate: (value: string) => {
          if (!value) return requiredMessage;
          const { countryCode, local } = parsePhone(value);
          return isPhoneLocalComplete(countryCode, local) || "Проверьте номер телефона";
        },
      }}
      render={({ field, fieldState }) => (
        <PhoneValue label={label} value={field.value ?? ""} onChange={field.onChange} error={fieldState.error?.message} />
      )}
    />
  );
}

function PhoneValue({ label, value, onChange, error }: { label: string; value: string; onChange: (value: string) => void; error?: string }) {
  // Код страны живёт отдельно: при пустом номере полный номер не собрать, а выбор кода терять нельзя.
  const [countryCode, setCountryCode] = React.useState<PhoneCountryCode>(() => parsePhone(value).countryCode);
  const local = value.startsWith(countryCode) ? value.slice(countryCode.length) : parsePhone(value).local;
  return (
    <PhoneNumberField
      label={label}
      countryCode={countryCode}
      phone={local}
      onCountryCodeChange={(code) => {
        setCountryCode(code);
        onChange(composePhone(code, local) ?? "");
      }}
      onPhoneChange={(next) => onChange(composePhone(countryCode, next) ?? "")}
      helperText={error}
    />
  );
}
