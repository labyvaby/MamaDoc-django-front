import React from "react";
import { Autocomplete, TextField, Typography } from "@mui/material";

import type { LabDoctor } from "../../../api/lab";
import IntakeSection from "./IntakeSection";

type Props = {
  doctors: LabDoctor[];
  value: number | null;
  loading: boolean;
  disabled: boolean;
  /** Анализы корзины, которые лаборатория делает только по направлению. */
  requiredFor: string[];
  onChange: (employeeId: number | null) => void;
};

/**
 * Направивший врач заказа.
 *
 * Список — из справочника самой ЛИС (`GET /lab/doctors/`), а не из наших
 * сотрудников: заказ уезжает с её идентификатором врача, и именно этих людей
 * ЛИС показывает в колонке «Нап. врач» своего интерфейса. ФИО дополнительно
 * сохраняется снимком в заказе, чтобы карточка не зависела от переименований
 * в справочнике.
 *
 * Обязателен не всегда. Каталог ЛИС помечает часть анализов признаком
 * «нужно направление» (`requiresDoctor`): пока в корзине нет ни одного
 * такого, поле остаётся подсказкой, а не преградой. Как только такой анализ
 * появился, его название показывается прямо здесь — блокировка кнопки
 * назовёт ту же причину, но искать её глазами внизу дровера не придётся.
 */
const ReferralSection: React.FC<Props> = ({
  doctors,
  value,
  loading,
  disabled,
  requiredFor,
  onChange,
}) => {
  const selected = doctors.find((doctor) => doctor.id === value) ?? null;
  const required = requiredFor.length > 0;

  return (
    <IntakeSection title="Направление" loading={loading}>
      <Autocomplete
        options={doctors}
        value={selected}
        onChange={(_event, next) => onChange(next?.id ?? null)}
        getOptionLabel={(option) =>
          option.qualification
            ? `${option.fullName} — ${option.qualification}`
            : option.fullName
        }
        isOptionEqualToValue={(option, current) => option.id === current.id}
        disabled={disabled}
        noOptionsText="Справочник врачей ЛИС пуст — синхронизируйте каталог"
        renderInput={(params) => (
          <TextField
            {...params}
            size="small"
            label="Направивший врач"
            placeholder="ФИО врача"
            required={required}
            error={required && value === null}
          />
        )}
      />

      {required && (
        <Typography
          variant="caption"
          color={value === null ? "error.main" : "text.secondary"}
        >
          {value === null ? "Обязателен для анализа: " : "Требуют направления: "}
          {requiredFor.join(", ")}
        </Typography>
      )}
    </IntakeSection>
  );
};

export default ReferralSection;
