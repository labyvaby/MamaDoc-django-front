import React from "react";
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  LinearProgress,
  Slider,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";

import { apiRequest, getErrorMessage } from "../../api/client";
import { getProcurementSettings, updateProcurementSettings } from "../../api/procurement";
import { djangoQueryKeys } from "../../api/queryKeys";
import { usePermissions } from "../../hooks/usePermissions";
import { SettingsLayout } from "./SettingsLayout";

type ModuleRow = { moduleCode: string; isEnabled: boolean };

/**
 * Модуль «Закупки»: включение для организации и правила распознавания
 * накладных по фото. Права сотрудников на кнопки страницы — в «Ролях».
 * Устроено как PosModuleSettingsPage: переключатель модуля идёт через
 * tenancy, правила модуля — через свою ручку /v2/procurement/settings/.
 */
export default function ProcurementSettingsPage() {
  const auth = usePermissions();
  const queryClient = useQueryClient();
  const org = auth.activeOrganization;
  const path = `/tenancy/organizations/${org?.id}/modules/`;
  const headers = { "X-Organization-Id": String(org?.id) };
  const scope = { organizationId: org?.id ?? null };

  // Список модулей организации читает только tenancy.modules.view (суперадмин);
  // руководителю с procurement.manage хватает enabledModules из /auth/context —
  // ему нужны правила распознавания, а не переключатель модуля.
  const canViewModules = auth.canAccess?.("tenancy.modules.view") ?? false;
  const canManageModule = auth.canAccess?.("tenancy.modules.manage") ?? false;
  const canManageRules = auth.canAccess?.("procurement.manage") ?? false;
  const modules = useQuery({
    queryKey: ["organization-procurement-module", org?.id],
    queryFn: () => apiRequest<ModuleRow[]>(path, { headers }),
    enabled: !!org && canViewModules,
  });
  const enabled = canViewModules
    ? (modules.data?.some((row) => row.moduleCode === "procurement" && row.isEnabled) ?? false)
    : auth.hasModule("procurement");

  const settings = useQuery({
    queryKey: djangoQueryKeys.procurement.settings(org?.id ?? null),
    queryFn: ({ signal }) => getProcurementSettings(scope, signal),
    enabled: Boolean(org && enabled),
  });

  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState("");
  const [threshold, setThreshold] = React.useState<number | null>(null);
  const effectiveThreshold = threshold ?? settings.data?.autoMatchThreshold ?? 75;

  const toggleModule = async (checked: boolean) => {
    if (pending) return;
    if (!checked && !window.confirm("Отключить закупки для всех сотрудников организации? Накладные, поставщики и оплаты сохранятся.")) return;
    setPending(true);
    setError("");
    try {
      const fresh = await apiRequest<ModuleRow[]>(path, { headers });
      const codes = fresh.filter((row) => row.isEnabled && row.moduleCode !== "procurement").map((row) => row.moduleCode);
      if (checked) codes.push("procurement");
      await apiRequest(path, { method: "PATCH", headers, body: { enabledModules: codes } });
      await modules.refetch();
      auth.retryAuth?.();
    } catch (e) {
      setError(getErrorMessage(e, "Не удалось изменить модуль."));
    } finally {
      setPending(false);
    }
  };

  const saveRules = async (data: { photoRecognition?: boolean; autoMatchThreshold?: number }) => {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await updateProcurementSettings(data, scope);
      await queryClient.invalidateQueries({ queryKey: djangoQueryKeys.procurement.settings(org?.id ?? null) });
      setThreshold(null);
    } catch (e) {
      setError(getErrorMessage(e, "Не удалось сохранить настройки."));
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingsLayout>
      <Stack p={3} gap={2}>
        <Typography variant="h5">Закупки и накладные · {org?.name}</Typography>
        <Alert severity="info">
          Поставщики, приёмки (накладные), возвраты и оплаты поставщикам. Модуль отдельный от «Склада»: остатки и товары
          работают и без него. Страница — <Link to="/invoices">Накладные</Link>.
        </Alert>
        {(modules.isFetching || settings.isFetching) && <LinearProgress />}
        {(error || modules.isError) && <Alert severity="error">{error || String(modules.error)}</Alert>}

        <FormControlLabel
          label="Модуль «Закупки и накладные»"
          control={
            <Switch
              checked={enabled}
              disabled={(canViewModules && !modules.data) || pending || !canManageModule}
              onChange={(_, checked) => void toggleModule(checked)}
            />
          }
        />
        {!canManageModule && (
          <Typography variant="body2" color="text.secondary">
            Включает и выключает модуль администратор платформы (право «Управление модулями организаций»).
          </Typography>
        )}
        <Typography color="text.secondary">
          Права сотрудников (кто оформляет накладные, проводит оплаты, распознаёт по фото) назначаются в ролях и правах —
          группа «Закупки». Здесь только общие правила организации.
        </Typography>

        <Stack gap={1.5} sx={{ mt: 1, p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
          <Typography variant="h6">Распознавание накладных по фото</Typography>
          <Typography variant="body2" color="text.secondary">
            Сотрудник фотографирует накладную — форма заполняется поставщиком, номером, датой и позициями. Ничего не
            проводится автоматически: позиции проверяет и подтверждает человек.
          </Typography>
          {!enabled && <Alert severity="info">Включите модуль, чтобы настроить распознавание.</Alert>}
          {enabled && settings.data && !settings.data.recognitionAvailable && (
            <Alert severity="warning">
              Распознавание не настроено на сервере (нет ключа провайдера) — кнопка «По фото» будет неактивна, фото к
              накладным сохраняются как обычно.
            </Alert>
          )}
          {enabled && settings.data && (
            <>
              <FormControlLabel
                label="Распознавать накладные по фото"
                control={
                  <Switch
                    checked={settings.data.photoRecognition}
                    disabled={pending || !canManageRules}
                    onChange={(_, checked) => void saveRules({ photoRecognition: checked })}
                  />
                }
              />
              <Box sx={{ maxWidth: 420 }}>
                <Typography variant="body2" gutterBottom>
                  Порог автоподстановки товара: <b>{effectiveThreshold}%</b>
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                  Насколько похожа распознанная строка на товар каталога, чтобы подставить его без вопроса. Ниже порога
                  — товар предлагается, но выбор остаётся за сотрудником. Штрихкод и артикул подставляются всегда.
                </Typography>
                <Slider
                  value={effectiveThreshold}
                  min={40}
                  max={100}
                  step={5}
                  marks={[{ value: 40, label: "40" }, { value: 75, label: "75" }, { value: 100, label: "100" }]}
                  disabled={pending || !canManageRules}
                  onChange={(_, value) => setThreshold(value as number)}
                />
                {threshold != null && threshold !== settings.data.autoMatchThreshold && (
                  <Button variant="contained" size="small" disabled={pending} onClick={() => void saveRules({ autoMatchThreshold: threshold })}>
                    Сохранить порог
                  </Button>
                )}
              </Box>
              <Typography variant="caption" color="text.secondary">
                Провайдер: {settings.data.recognitionProvider || "—"}
                {settings.data.recognitionModel ? ` · модель: ${settings.data.recognitionModel}` : ""} · снимок хранится у нас и
                прикрепляется к накладной; провайдер получает копию только на время распознавания.
              </Typography>
            </>
          )}
        </Stack>
      </Stack>
    </SettingsLayout>
  );
}
