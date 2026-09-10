import React from "react";
import { Alert, Button, Card, Stack, Typography } from "@mui/material";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SettingsLayout } from "./SettingsLayout";
import { usePermissions } from "../../hooks/usePermissions";
import { ClientLayoutSettingsFields } from "../clients/ClientLayoutSettingsDialog";
import { defaultClientLayoutSettings, getClientLayoutSettings, updateClientLayoutSettings, type ClientLayoutSettings } from "../clients/clientLayout";

export default function ClientsSettingsPage() {
  const { activeOrganization } = usePermissions();
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState<ClientLayoutSettings>(defaultClientLayoutSettings);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState("");
  const organizationId = activeOrganization?.id ?? null;
  const settings = useQuery({
    queryKey: ["client-layout-settings", organizationId],
    queryFn: ({ signal }) => getClientLayoutSettings(organizationId as number, signal),
    enabled: organizationId !== null,
  });

  React.useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);

  const save = async () => {
    if (!organizationId) return;
    setError("");
    try {
      const next = await updateClientLayoutSettings(organizationId, draft);
      setDraft(next);
      await queryClient.invalidateQueries({ queryKey: ["client-layout-settings", organizationId] });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить настройки.");
    }
  };

  return <SettingsLayout>
    <Stack p={3} gap={2} maxWidth={720}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}>
        <BoxTitle />
        <Button variant="contained" startIcon={<SaveOutlined />} onClick={() => void save()} disabled={settings.isFetching}>Сохранить</Button>
      </Stack>
      <Alert severity="info">Здесь настраивается карточка клиента магазина: блоки профиля и порядок бокового меню. Настройки сохраняются для всей организации и применяются всем сотрудникам.</Alert>
      {settings.isFetching && <Alert severity="info">Загрузка настроек…</Alert>}
      {(error || settings.isError) && <Alert severity="error">{error || String(settings.error)}</Alert>}
      {saved && <Alert severity="success">Настройки карточки клиента сохранены.</Alert>}
      <Card variant="outlined" sx={{ p: 2.5 }}><ClientLayoutSettingsFields value={draft} onChange={setDraft} /></Card>
    </Stack>
  </SettingsLayout>;
}
function BoxTitle() {
  return <Stack gap={0.25}><Typography variant="h5">Клиенты</Typography><Typography color="text.secondary">Настройка карточки и бокового меню</Typography></Stack>;
}
