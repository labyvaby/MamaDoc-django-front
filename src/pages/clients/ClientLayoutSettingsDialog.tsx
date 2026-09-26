import React from "react";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Typography,
} from "@mui/material";
import type { ClientLayoutSettings } from "./clientLayout";

type Props = {
  open: boolean;
  value: ClientLayoutSettings;
  onClose: () => void;
  onSave: (value: ClientLayoutSettings) => void;
};

type FieldsProps = {
  value: ClientLayoutSettings;
  onChange: React.Dispatch<React.SetStateAction<ClientLayoutSettings>>;
};

export function ClientLayoutSettingsFields({ value, onChange }: FieldsProps) {
  return (
    <Stack gap={2}>
      <Typography variant="body2" color="text.secondary">
        Выберите блоки, которые будут показаны в карточке клиента.
      </Typography>
      <Stack>
        <Typography variant="subtitle2">Блоки карточки</Typography>
        {([
          ["identity", "Основные данные"],
          ["company", "Реквизиты компании"],
          ["finance", "Баланс и долг"],
          ["note", "Комментарий"],
        ] as const).map(([key, label]) => (
          <FormControlLabel
            key={key}
            control={<Checkbox checked={value.sections[key]} onChange={(_, checked) => onChange((current) => ({ ...current, sections: { ...current.sections, [key]: checked } }))} />}
            label={label}
          />
        ))}
      </Stack>
    </Stack>
  );
}

export default function ClientLayoutSettingsDialog({ open, value, onClose, onSave }: Props) {
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Настройка карточки клиента</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1 }}><ClientLayoutSettingsFields value={draft} onChange={setDraft} /></Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="contained" onClick={() => { onSave(draft); onClose(); }}>Сохранить</Button>
      </DialogActions>
    </Dialog>
  );
}
