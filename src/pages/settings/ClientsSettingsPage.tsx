import React from "react";
import { Alert, Button, Card, Divider, Stack, TextField, Typography } from "@mui/material";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SettingsLayout } from "./SettingsLayout";
import { usePermissions } from "../../hooks/usePermissions";
import { createClientStatus, getClientStatuses, type DjangoClientStatus } from "../../api/clients";
import { ClientLayoutSettingsFields } from "../clients/ClientLayoutSettingsDialog";
import { defaultClientLayoutSettings, getClientLayoutSettings, updateClientLayoutSettings, type ClientLayoutSettings } from "../clients/clientLayout";

export default function ClientsSettingsPage() {
  const { activeOrganization } = usePermissions();
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState<ClientLayoutSettings>(defaultClientLayoutSettings);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState("");
  const [newStatus, setNewStatus] = React.useState("");
  const organizationId = activeOrganization?.id ?? null;
  const settings = useQuery({
    queryKey: ["client-layout-settings", organizationId],
    queryFn: ({ signal }) => getClientLayoutSettings(organizationId as number, signal),
    enabled: organizationId !== null,
  });
  const statuses = useQuery({
    queryKey: ["client-statuses", organizationId],
    queryFn: ({ signal }) => getClientStatuses(organizationId as number, signal),
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

  const addStatus = async () => {
    if (!organizationId || !newStatus.trim()) return;
    try {
      await createClientStatus(organizationId, { name: newStatus.trim() });
      setNewStatus("");
      await queryClient.invalidateQueries({ queryKey: ["client-statuses", organizationId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось добавить статус.");
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
      <Card variant="outlined" sx={{ p: 2.5 }}>
        <Typography variant="h6">Статусы клиентов</Typography>
        <Typography color="text.secondary" variant="body2" mb={2}>VIP и «Обычный» созданы автоматически. Здесь можно добавлять свои статусы, а затем присваивать их клиентам.</Typography>
        <Stack direction={{ xs: "column", sm: "row" }} gap={1} mb={2}>
          <TextField size="small" label="Новый статус" value={newStatus} onChange={(event) => setNewStatus(event.target.value)} fullWidth />
          <Button variant="outlined" onClick={() => void addStatus()} disabled={!newStatus.trim()}>Добавить</Button>
        </Stack>
        <Divider />
        <Stack gap={1} mt={2}>{(statuses.data ?? []).map((status: DjangoClientStatus) => <Stack key={status.id} direction="row" alignItems="center" gap={1}><Typography sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: status.color }} /><Typography>{status.name}</Typography>{status.isSystem && <Typography variant="caption" color="text.secondary">системный</Typography>}</Stack>)}</Stack>
      </Card>
    </Stack>
  </SettingsLayout>;
}
function BoxTitle() {
  return <Stack gap={0.25}><Typography variant="h5">Клиенты</Typography><Typography color="text.secondary">Настройка карточки и бокового меню</Typography></Stack>;
}
