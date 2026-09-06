import React from "react";
import {
  Alert,
  Button,
  FormControlLabel,
  LinearProgress,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { apiRequest } from "../../api/client";
import { usePermissions } from "../../hooks/usePermissions";
import { SettingsLayout } from "./SettingsLayout";

type ModuleRow = { moduleCode: string; isEnabled: boolean };
export default function PosModuleSettingsPage() {
  const auth = usePermissions();
  const org = auth.activeOrganization;
  const path = `/tenancy/organizations/${org?.id}/modules/`;
  const headers = { "X-Organization-Id": String(org?.id) };
  const modules = useQuery({
    queryKey: ["organization-pos-module", org?.id],
    queryFn: () => apiRequest<ModuleRow[]>(path, { headers }),
    enabled: !!org,
  });
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState("");
  const enabled =
    modules.data?.some((row) => row.moduleCode === "pos" && row.isEnabled) ??
    false;
  const toggle = async (checked: boolean) => {
    if (pending) return;
    if (
      !checked &&
      !window.confirm(
        "Отключить кассу магазина для всех сотрудников организации? Чеки и остатки сохранятся."
      )
    )
      return;
    setPending(true);
    setError("");
    try {
      const fresh = await apiRequest<ModuleRow[]>(path, { headers });
      const codes = fresh
        .filter((row) => row.isEnabled && row.moduleCode !== "pos")
        .map((row) => row.moduleCode);
      if (checked) codes.push("pos");
      await apiRequest(path, {
        method: "PATCH",
        headers,
        body: { enabledModules: codes },
      });
      await modules.refetch();
      auth.retryAuth?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось изменить модуль.");
    } finally {
      setPending(false);
    }
  };
  return (
    <SettingsLayout>
      <Stack p={3} gap={2}>
        <Typography variant="h5">Касса магазина · {org?.name}</Typography>
        <Alert severity="info">
          POS — продажа одежды и других товаров. «Касса / финансы» — отдельный
          модуль: смены, движение денег и финансовые отчёты. Этот переключатель
          не отключает финансовую кассу.
        </Alert>
        {modules.isFetching && <LinearProgress />}
        {(error || modules.isError) && (
          <Alert severity="error">{error || String(modules.error)}</Alert>
        )}
        <FormControlLabel
          label="Касса магазина (POS)"
          control={
            <Switch
              checked={enabled}
              disabled={
                !modules.data ||
                pending ||
                !auth.canAccess?.("tenancy.modules.manage")
              }
              onChange={(_, checked) => void toggle(checked)}
            />
          }
        />
        <Typography color="text.secondary">
          Права сотрудников назначаются в ролях (группа POS). Скидки, способы
          оплаты, возвраты и другие действия дополнительно регулируются
          правилами кассы.
        </Typography>
        <Stack direction="row" gap={2}>
          {enabled && auth.canAccess?.("pos.view") && (
            <Button component={Link} to="/pos" variant="contained">
              Открыть кассу и правила
            </Button>
          )}
          {auth.canAccess?.("rbac.roles.view") && (
            <Button component={Link} to="/settings/roles">
              Роли и права
            </Button>
          )}
        </Stack>
      </Stack>
    </SettingsLayout>
  );
}
