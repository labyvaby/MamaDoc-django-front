import React from "react";
import { TextField } from "@mui/material";

import IntakeSection from "./IntakeSection";

type Props = {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

/**
 * Свободный комментарий ко всему заказу.
 *
 * Своя секция, а не поле внутри «Направления»: комментарий относится к
 * заказу целиком, а не к тому, кто выписал направление, и стоял там только
 * потому, что оба поля появились одной работой. Место в потоке — между
 * подготовкой и оплатой: это последнее, что регистратор дописывает перед
 * тем, как принять деньги.
 *
 * Ни на что не влияет: хранится в заказе, виден в его карточке, в ЛИС не
 * уезжает (свободный текст заказа ЛИС занят направившим врачом — см.
 * `order_to_dto` на бэкенде).
 */
const CommentSection: React.FC<Props> = ({ value, disabled, onChange }) => (
  <IntakeSection title="Комментарий к заказу">
    <TextField
      size="small"
      fullWidth
      multiline
      minRows={2}
      placeholder="Необязательно"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
    />
  </IntakeSection>
);

export default CommentSection;
