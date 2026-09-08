import React from "react";
import { Alert, Button, Card, Stack, Typography } from "@mui/material";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import { SettingsLayout } from "./SettingsLayout";
import { usePermissions } from "../../hooks/usePermissions";
import { ClientLayoutSettingsFields } from "../clients/ClientLayoutSettingsDialog";
import { defaultClientLayoutSettings, readClientLayoutSettings, writeClientLayoutSettings, type ClientLayoutSettings } from "../clients/clientLayout";

export default function ClientsSettingsPage() {
  const { activeOrganization } = usePermissions();
  const [draft, setDraft] = React.useState<ClientLayoutSettings>(defaultClientLayoutSettings);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    setDraft(readClientLayoutSettings(activeOrganization?.id ?? null));
  }, [activeOrganization?.id]);

  const save = () => {
    writeClientLayoutSettings(activeOrganization?.id ?? null, draft);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  return <SettingsLayout>
    <Stack p={3} gap={2} maxWidth={720}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}>
        <BoxTitle />
        <Button variant="contained" startIcon={<SaveOutlined />} onClick={save}>Сохранить</Button>
      </Stack>
      <Alert severity="info">Здесь настраивается карточка клиента магазина: блоки профиля и порядок бокового меню. Изменения применяются к странице «Клиенты».</Alert>
      {saved && <Alert severity="success">Настройки карточки клиента сохранены.</Alert>}
      <Card variant="outlined" sx={{ p: 2.5 }}><ClientLayoutSettingsFields value={draft} onChange={setDraft} /></Card>
    </Stack>
  </SettingsLayout>;
}
function BoxTitle() {
  return <Stack gap={0.25}><Typography variant="h5">Клиенты</Typography><Typography color="text.secondary">Настройка карточки и бокового меню</Typography></Stack>;
}
