import React from "react";
import {
  Alert,
  Button,
  FormControlLabel,
  LinearProgress,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { posRequest } from "../../api/pos";
import { usePermissions } from "../../hooks/usePermissions";
import { SettingsLayout } from "./SettingsLayout";

type PosRulesResponse = {
  rules: Record<string, boolean | number | string>;
  labels: Record<string, string>;
};

export default function PosModuleSettingsPage() {
  const auth = usePermissions();
  const org = auth.activeOrganization;
  const branch = auth.activeBranch;
  const [error, setError] = React.useState("");
  const canManageRules = auth.canAccess?.("pos.manage") ?? false;
  const scope = {
    organizationId: org?.id ?? 0,
    branchId: branch?.id ?? 0,
  };
  const rules = useQuery({
    queryKey: ["organization-pos-rules", scope.organizationId, scope.branchId],
    queryFn: () => posRequest<PosRulesResponse>(scope, "rules/"),
    enabled: Boolean(canManageRules && scope.branchId),
  });
  const [ruleDraft, setRuleDraft] = React.useState<
    Record<string, boolean | number | string>
  >({});
  const [rulesPending, setRulesPending] = React.useState(false);

  React.useEffect(() => {
    if (rules.data) setRuleDraft(rules.data.rules);
  }, [rules.data]);

  return (
    <SettingsLayout>
      <Stack p={{ xs: 0, sm: 1 }} gap={2.5}>
        <Stack gap={0.5}>
          <Typography variant="h5">Магазин · {org?.name}</Typography>
          <Typography color="text.secondary">
            Правила продажи товаров для всей организации. Доступ сотрудников
            к продаже, скидкам и возвратам настраивается через роли.
          </Typography>
        </Stack>
        <Alert severity="info">
          Сам модуль «Магазин» подключает администратор платформы. Здесь нет
          доступа к тарифу или включению страниц — только рабочие правила POS.
        </Alert>
        {error && <Alert severity="error">{error}</Alert>}
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
          {!branch && (
            <Alert severity="warning">
              Выберите филиал в верхней панели, чтобы загрузить настройки.
            </Alert>
          )}
          {branch && !canManageRules && (
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
                ) : key === "discount_mode" ? (
                  <TextField
                    key={key}
                    select
                    label="Режим скидок"
                    value={value}
                    onChange={(event) =>
                      setRuleDraft((previous) => ({
                        ...previous,
                        [key]: event.target.value,
                      }))
                    }
                    helperText="Ручной процент, справочник видов скидок или оба варианта"
                  >
                    <MenuItem value="both">Ручные и виды скидок</MenuItem>
                    <MenuItem value="manual">Только ручные скидки</MenuItem>
                    <MenuItem value="kinds">Только виды скидок</MenuItem>
                  </TextField>
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
          {auth.canAccess?.("pos.view") && (
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
