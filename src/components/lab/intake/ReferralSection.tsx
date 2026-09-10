import React from "react";
import { Autocomplete, TextField, Typography } from "@mui/material";

import type { DjangoEmployeeListItem } from "../../../api/staff";
import IntakeSection from "./IntakeSection";

type Props = {
  doctors: DjangoEmployeeListItem[];
  value: number | null;
  loading: boolean;
  disabled: boolean;
  /** Анализы корзины, которые лаборатория делает только по направлению. */
  requiredFor: string[];
  onChange: (employeeId: number | null) => void;
  comment: string;
  onCommentChange: (value: string) => void;
};

/**
 * Направивший врач заказа.
 *
 * Кому это нужно. Лаборатории — чтобы знать, кому возвращать результат:
 * отдельного поля под направившего врача в `orderDTO` ЛИС нет, и он уезжает
 * свободным текстом `other_information`. Клинике — чтобы видеть, кто
 * направляет на анализы, ФИО сохраняется снимком в самом заказе.
 *
 * Обязателен не всегда. Каталог ЛИС помечает часть анализов признаком
 * «нужно направление» (`requiresDoctor`): пока в корзине нет ни одного
 * такого, поле остаётся подсказкой, а не преградой. Как только такой анализ
 * появился, его название показывается прямо здесь — блокировка кнопки
 * назовёт ту же причину, но искать её глазами внизу дровера не придётся.
 *
 * Комментарий стоит рядом с врачом, а не в оплате: и то, и другое —
 * сопровождение заказа, а не деньги. Он свободный и ни на что не влияет:
 * хранится в самом заказе и виден в его карточке.
 */
const ReferralSection: React.FC<Props> = ({
  doctors,
  value,
  loading,
  disabled,
  requiredFor,
  onChange,
  comment,
  onCommentChange,
}) => {
  const selected = doctors.find((doctor) => doctor.id === value) ?? null;
  const required = requiredFor.length > 0;

  return (
    <IntakeSection title="Направление" loading={loading}>
      <Autocomplete
        options={doctors}
        value={selected}
        onChange={(_event, next) => onChange(next?.id ?? null)}
        getOptionLabel={(option) => option.fullName}
        isOptionEqualToValue={(option, current) => option.id === current.id}
        disabled={disabled}
        noOptionsText="Сотрудники не найдены"
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

      <TextField
        size="small"
        fullWidth
        multiline
        minRows={2}
        label="Комментарий"
        placeholder="Необязательно"
        value={comment}
        onChange={(event) => onCommentChange(event.target.value)}
        disabled={disabled}
      />
    </IntakeSection>
  );
};

export default ReferralSection;
