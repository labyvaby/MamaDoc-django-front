/**
 * VisitCreateDialog.tsx
 * Презентационный диалог создания приема (без API-логики).
 * Отвечает за: отображение формы, ввод полей и делегирование событий наверх.
 * Все данные и колбэки приходят через пропсы (SRP).
 */
import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  TextField,
  Button,
} from "@mui/material";
import { roundDateTimeLocalToStep } from "../../../utility/time";

type Props = {
  open: boolean;
  fullScreen?: boolean;

  // режим: создание (по умолчанию) или редактирование
  mode?: "create" | "edit";
  // переопределение заголовка и текста кнопки (необязательно)
  titleText?: string;
  submitLabel?: string;

  dateTime: string;
  doctor: string;
  service: string;
  price: number | "";

  onChangeDateTime: (v: string) => void;
  onChangeDoctor: (v: string) => void;
  onChangeService: (v: string) => void;
  onChangePrice: (v: number | "") => void;

  onClose: () => void;
  onSubmit: () => void;
  submitting?: boolean;
  disabled?: boolean; // например, когда пациент не выбран
  touched?: boolean; // показывать ли ошибки валидации
};

const VisitCreateDialog: React.FC<Props> = ({
  open,
  fullScreen,
  mode = "create",
  titleText,
  submitLabel,
  dateTime,
  doctor,
  service,
  price,
  onChangeDateTime,
  onChangeDoctor,
  onChangeService,
  onChangePrice,
  onClose,
  onSubmit,
  submitting = false,
  disabled = false,
  touched = false,
}) => {
  const isEdit = mode === "edit";
  const resolvedTitle = titleText ?? (isEdit ? "Редактировать прием" : "Создать прием");
  const resolvedSubmit = submitLabel ?? (isEdit ? "Сохранить" : "Создать");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      fullScreen={fullScreen}
    >
      <DialogTitle>{resolvedTitle}</DialogTitle>
      <DialogContent>
        {/* Секция: Поля формы приема */}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Дата и время *"
            type="datetime-local"
            value={dateTime}
            onChange={(e) => onChangeDateTime(roundDateTimeLocalToStep(e.target.value, 5))}
            inputProps={{ step: 300 }}
            InputLabelProps={{ shrink: true }}
            fullWidth
            error={touched && !dateTime}
            helperText={touched && !dateTime ? "Обязательное поле" : ""}
          />
          <TextField
            label="Доктор (ФИО или ID)"
            value={doctor}
            onChange={(e) => onChangeDoctor(e.target.value)}
            fullWidth
          />
          <TextField
            label="Услуга (ID или название)"
            value={service}
            onChange={(e) => onChangeService(e.target.value)}
            fullWidth
          />
          <TextField
            label="Стоимость"
            type="number"
            value={price}
            onChange={(e) => onChangePrice(e.target.value === "" ? "" : Number(e.target.value))}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        {/* Секция: Кнопки управления */}
        <Button onClick={onClose} disabled={submitting}>Отмена</Button>
        <Button
          onClick={onSubmit}
          variant="contained"
          disabled={disabled || submitting || !dateTime}
        >
          {resolvedSubmit}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default VisitCreateDialog;
