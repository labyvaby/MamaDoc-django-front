/**
 * Поле формы отеля с проверкой ввода и иконкой — одно место для всех форм
 * добавления (номер, категория, бронь, гость, оплата, кухня, уборка).
 *
 * Раньше каждое поле было голым TextField: в «Этаж» можно было набрать буквы,
 * type="number" пропускал «e» и менял значение колесом мыши, телефон и email
 * не проверялись, а иконка была только у имени гостя. Здесь:
 *   • ввод чистится по типу поля (kind): в числовые буквы просто не набираются;
 *   • fieldError — та же проверка, что показывает поле, — формы зовут её для
 *     кнопки «Сохранить», чтобы не отправлять заведомо неверное;
 *   • ошибка видна после ухода из поля или по showErrors (попытка сохранить),
 *     а не с первой буквы;
 *   • иконка слева, справа — галочка у верно заполненного и значок ошибки.
 */
import React from "react";
import { InputAdornment, TextField, type TextFieldProps } from "@mui/material";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";

import { fieldError, sanitizeFieldInput, type FieldKind, type FieldRules } from "./formRules";

const INPUT_MODE: Record<FieldKind, React.HTMLAttributes<HTMLInputElement>["inputMode"]> = {
  text: "text",
  int: "numeric",
  decimal: "decimal",
  phone: "tel",
  email: "email",
};

export type FormFieldProps = Omit<TextFieldProps, "onChange" | "value" | "type"> & {
  value: string;
  /** Уже очищенное значение. */
  onValueChange: (value: string) => void;
  /** Иконка слева — что это за поле. */
  icon?: React.ReactNode;
  rules?: FieldRules;
  /** Показать ошибку, даже если поле ещё не трогали (была попытка сохранить). */
  showErrors?: boolean;
  /** Единица справа («м²», «сом») — рядом со значком проверки. */
  unit?: React.ReactNode;
  /** Галочка у верно заполненного поля (по умолчанию — у обязательных). */
  showValid?: boolean;
};

// forwardRef: Collapse, Tooltip и другие обёртки MUI вешают ref на ребёнка —
// без него React пишет в консоль «Function components cannot be given refs».
export const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(function FormField(
  { value, onValueChange, icon, rules = {}, showErrors = false, unit, showValid, helperText, onBlur, slotProps, select, required, ...rest },
  ref,
) {
  const [touched, setTouched] = React.useState(false);
  const effectiveRules: FieldRules = { ...rules, required: rules.required ?? required };
  const error = fieldError(value, effectiveRules);
  // Своя проверка (после ухода из поля / попытки сохранить) или внешняя —
  // от useFormValidation через {...v.field("key")}.
  const visibleError = ((touched || showErrors) && error != null) || Boolean(rest.error);
  const valid = !select && value.trim() !== "" && error == null && (showValid ?? Boolean(effectiveRules.required));
  const kind = effectiveRules.kind ?? "text";

  const statusIcon = visibleError ? (
    <ErrorOutlineOutlined fontSize="small" color="error" />
  ) : valid ? (
    <CheckCircleOutlined fontSize="small" color="success" />
  ) : null;

  const inputSlot = (slotProps?.input ?? {}) as Record<string, unknown>;
  const htmlInputSlot = (slotProps?.htmlInput ?? {}) as Record<string, unknown>;

  return (
    <TextField
      {...rest}
      ref={ref}
      select={select}
      required={effectiveRules.required}
      type="text"
      value={value}
      onChange={(e) => onValueChange(select ? e.target.value : sanitizeFieldInput(e.target.value, effectiveRules))}
      onBlur={(e) => {
        setTouched(true);
        onBlur?.(e);
      }}
      error={visibleError}
      helperText={(touched || showErrors) && error != null ? error : helperText}
      slotProps={{
        ...slotProps,
        htmlInput: { inputMode: INPUT_MODE[kind], ...htmlInputSlot },
        input: {
          ...inputSlot,
          startAdornment: icon ? (
            <InputAdornment
              position="start"
              sx={{
                color: visibleError ? "error.main" : "text.disabled",
                "& svg": { fontSize: 20 },
                // В многострочном поле иконка — у первой строки, а не посередине.
                ...(rest.multiline ? { alignSelf: "flex-start", mt: 1.25 } : {}),
              }}
            >
              {icon}
            </InputAdornment>
          ) : (
            (inputSlot.startAdornment as React.ReactNode)
          ),
          endAdornment:
            unit || statusIcon ? (
              <InputAdornment position="end" sx={{ gap: 0.75, mr: select ? 2 : 0 }}>
                {unit}
                {statusIcon}
              </InputAdornment>
            ) : (
              (inputSlot.endAdornment as React.ReactNode)
            ),
        },
      }}
    />
  );
});

export default FormField;
