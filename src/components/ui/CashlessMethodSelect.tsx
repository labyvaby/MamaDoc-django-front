import React from "react";
import { MenuItem, Stack, TextField, Typography } from "@mui/material";

import type { DjangoCashlessMethod } from "../../api/cashlessMethods";
import { useT } from "../../i18n/VerticalProvider";

export type CashlessMethodSelectProps = {
  /** Активные способы из useCashlessMethods */
  methods: DjangoCashlessMethod[];
  value: number | "";
  onChange: (value: number | "") => void;
  /** Показать поле как незаполненное (сумма безнала есть, способ не выбран) */
  error?: boolean;
  disabled?: boolean;
  loading?: boolean;
  /**
   * Справочник не загрузился. Пустой список из-за ошибки нельзя показывать как
   * «справочник пуст»: пользователь решит, что выбирать нечего, а сохранение
   * при этом заблокировано.
   */
  loadFailed?: boolean;
  /** Подпись над полем; по умолчанию — «Способ безналичной оплаты» */
  label?: string;
};

/**
 * Селект способа безналичной оплаты. Общий для оплаты приёма, расхода и прихода
 * на склад: везде показывается ровно тогда, когда в форме есть безналичная
 * сумма, и требует выбора, пока справочник непуст.
 *
 * Лейбл — заголовком над полем (floating-label запрещён гайдом стиля).
 */
export const CashlessMethodSelect: React.FC<CashlessMethodSelectProps> = ({
  methods,
  value,
  onChange,
  error = false,
  disabled = false,
  loading = false,
  loadFailed = false,
  label,
}) => {
  const { t } = useT("common");

  const placeholderText = loading
    ? t("cashlessMethod.loading")
    : loadFailed
      ? t("cashlessMethod.loadFailed")
      : methods.length === 0
        ? t("cashlessMethod.empty")
        : t("cashlessMethod.placeholder");

  const helperText = loadFailed
    ? t("cashlessMethod.loadFailedHint")
    : error
      ? t("cashlessMethod.required")
      : "";

  /**
   * Единственный способ формы подставляют автоматически — выпадающий список из
   * одного пункта только добавляет клик. Показываем его строкой, чтобы кассир
   * всё равно видел, чем проводится оплата.
   *
   * Исключение — `error`: если подстановка почему-то не сработала и форма
   * требует выбор, без селекта сохранение оказалось бы в тупике.
   */
  const singleMethod =
    !loading && !loadFailed && !error && methods.length === 1 ? methods[0] : null;

  if (singleMethod) {
    return (
      <Stack spacing={0.5}>
        <Typography variant="caption" color="text.secondary" display="block">
          {label ?? t("cashlessMethod.label")}
        </Typography>
        <Typography variant="body2" color={disabled ? "text.disabled" : "text.primary"}>
          {singleMethod.name}
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={0.5}>
      <Typography variant="caption" color="text.secondary" display="block">
        {label ?? t("cashlessMethod.label")}
      </Typography>
      <TextField
        select
        size="small"
        fullWidth
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        error={error || loadFailed}
        helperText={helperText}
        disabled={disabled}
        SelectProps={{
          // Пустое значение — не пустое поле: показываем подсказку, иначе
          // невыбранный способ выглядит как сломанный контрол.
          displayEmpty: true,
          renderValue: (selected) => {
            const id = selected as number | "";
            if (id === "") {
              return (
                <Typography component="span" variant="body2" color="text.disabled">
                  {placeholderText}
                </Typography>
              );
            }
            return methods.find((m) => m.id === id)?.name ?? "";
          },
        }}
      >
        {methods.length === 0 && (
          <MenuItem value="" disabled>
            {placeholderText}
          </MenuItem>
        )}
        {methods.map((m) => (
          <MenuItem key={m.id} value={m.id}>
            {m.name}
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  );
};

export default CashlessMethodSelect;
