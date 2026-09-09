import React from "react";
import {
  Alert,
  Button,
  FormControlLabel,
  LinearProgress,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { apiRequest } from "../../api/client";
import { posRequest } from "../../api/pos";
import { usePermissions } from "../../hooks/usePermissions";
import { SettingsLayout } from "./SettingsLayout";

type ModuleRow = { moduleCode: string; isEnabled: boolean };
type PosRulesResponse = {
  rules: Record<string, boolean | number>;
  labels: Record<string, string>;
};

export default function PosModuleSettingsPage() {
  const auth = usePermissions();
  const org = auth.activeOrganization;
  const branch = auth.activeBranch;
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
  const canManageRules = auth.canAccess?.("pos.manage") ?? false;
  const scope = {
    organizationId: org?.id ?? 0,
    branchId: branch?.id ?? 0,
  };
  const rules = useQuery({
    queryKey: ["organization-pos-rules", scope.organizationId, scope.branchId],
    queryFn: () => posRequest<PosRulesResponse>(scope, "rules/"),
    enabled: Boolean(enabled && canManageRules && scope.branchId),
  });
  const [ruleDraft, setRuleDraft] = React.useState<
    Record<string, boolean | number>
  >({});
  const [rulesPending, setRulesPending] = React.useState(false);

  React.useEffect(() => {
    if (rules.data) setRuleDraft(rules.data.rules);
  }, [rules.data]);

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
          Права сотрудников назначаются отдельно в ролях и правах. Здесь
          находятся только общие правила организации для кассы магазина.
        </Typography>
        <Stack
          gap={1.5}
          sx={{
            mt: 1,
            p: 2,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
          }}
        >
          <Typography variant="h6">Правила кассы</Typography>
          <Typography variant="body2" color="text.secondary">
            Эти параметры действуют для всей организации. Доступ конкретного
            сотрудника к продаже, скидкам, возвратам и оплатам настраивается в
            разделе «Роли и права».
          </Typography>
          {!enabled && (
            <Alert severity="info">
              Включите модуль POS, чтобы настроить правила кассы.
            </Alert>
          )}
          {enabled && !branch && (
            <Alert severity="warning">
              Выберите филиал в верхней панели, чтобы загрузить настройки.
            </Alert>
          )}
          {enabled && branch && !canManageRules && (
            <Alert severity="info">
              У вас нет права изменять правила кассы. Обратитесь к владельцу
              организации или администратору ролей.
            </Alert>
          )}
          {rules.isFetching && <LinearProgress />}
          {rules.isError && (
            <Alert severity="error">{String(rules.error)}</Alert>
          )}
          {canManageRules && rules.data && (
            <Stack gap={1}>
              {Object.entries(ruleDraft).map(([key, value]) =>
                typeof value === "boolean" ? (
                  <FormControlLabel
                    key={key}
                    control={
                      <Switch
                        checked={value}
                        onChange={(_, checked) =>
                          setRuleDraft((previous) => ({
                            ...previous,
                            [key]: checked,
                          }))
                        }
                      />
                    }
                    label={
                      rules.data.labels[key] ??
                      (key === "require_shift"
                        ? "Требовать открытую смену"
                        : key)
                    }
                  />
                ) : (
                  <TextField
                    key={key}
                    type="number"
                    label={
                      key === "reservation_hours"
                        ? "Срок резерва, часов"
                        : "Максимальная ручная скидка, %"
                    }
                    value={value}
                    onChange={(event) =>
                      setRuleDraft((previous) => ({
                        ...previous,
                        [key]: Number(event.target.value),
                      }))
                    }
                  />
                )
              )}
              <Button
                variant="contained"
                disabled={rulesPending || rules.isFetching}
                onClick={async () => {
                  setRulesPending(true);
                  try {
                    await posRequest(scope, "rules/", {
                      method: "PATCH",
                      body: { rules: ruleDraft },
                    });
                    await rules.refetch();
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Не удалось сохранить правила кассы."
                    );
                  } finally {
                    setRulesPending(false);
                  }
                }}
              >
                Сохранить правила
              </Button>
            </Stack>
          )}
        </Stack>
        <Stack direction="row" gap={2}>
          {enabled && auth.canAccess?.("pos.view") && (
            <Button component={Link} to="/pos" variant="contained">
              Открыть кассу
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
