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
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import ArrowDownwardOutlined from "@mui/icons-material/ArrowDownwardOutlined";
import ArrowUpwardOutlined from "@mui/icons-material/ArrowUpwardOutlined";
import ViewSidebarOutlined from "@mui/icons-material/ViewSidebarOutlined";
import type { ClientLayoutSettings, ClientTabKey } from "./clientLayout";

type Props = {
  open: boolean;
  value: ClientLayoutSettings;
  onClose: () => void;
  onSave: (value: ClientLayoutSettings) => void;
};

const tabLabels: Record<ClientTabKey, string> = {
  purchases: "История покупок",
  contacts: "Контактные лица",
};

type FieldsProps = {
  value: ClientLayoutSettings;
  onChange: React.Dispatch<React.SetStateAction<ClientLayoutSettings>>;
};

export function ClientLayoutSettingsFields({ value, onChange }: FieldsProps) {
  const moveTab = (tab: ClientTabKey, direction: -1 | 1) => {
    onChange((current) => {
      const index = current.tabs.indexOf(tab);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.tabs.length) return current;
      const tabs = [...current.tabs];
      [tabs[index], tabs[nextIndex]] = [tabs[nextIndex], tabs[index]];
      return { ...current, tabs };
    });
  };

  return (
    <Stack gap={2}>
      <Typography variant="body2" color="text.secondary">
        Выберите блоки карточки и порядок разделов в боковом меню профиля клиента.
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
      <Stack>
        <Typography variant="subtitle2">Боковое меню</Typography>
        <List dense disablePadding>
          {value.tabs.map((tab, index) => (
            <ListItem key={tab} disableGutters secondaryAction={<Stack direction="row"><IconButton size="small" disabled={index === 0} onClick={() => moveTab(tab, -1)} aria-label="Переместить вверх"><ArrowUpwardOutlined fontSize="small" /></IconButton><IconButton size="small" disabled={index === value.tabs.length - 1} onClick={() => moveTab(tab, 1)} aria-label="Переместить вниз"><ArrowDownwardOutlined fontSize="small" /></IconButton></Stack>}>
              <ViewSidebarOutlined color="action" sx={{ mr: 1 }} /><ListItemText primary={tabLabels[tab]} />
            </ListItem>
          ))}
        </List>
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
