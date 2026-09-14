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

import { getErrorMessage } from "../../api/client";
import { getProcurementSettings, updateProcurementSettings } from "../../api/procurement";
import { djangoQueryKeys } from "../../api/queryKeys";
import { usePermissions } from "../../hooks/usePermissions";
import { SettingsLayout } from "./SettingsLayout";

/**
 * Рабочие настройки подключённого платформой модуля «Закупки».
 * Права сотрудников на действия с накладными задаются в «Ролях».
 */
export default function ProcurementSettingsPage() {
  const auth = usePermissions();
  const queryClient = useQueryClient();
  const org = auth.activeOrganization;
  const scope = { organizationId: org?.id ?? null };

  const canManageRules = auth.canAccess?.("procurement.manage") ?? false;

  const settings = useQuery({
    queryKey: djangoQueryKeys.procurement.settings(org?.id ?? null),
    queryFn: ({ signal }) => getProcurementSettings(scope, signal),
    enabled: Boolean(org && canManageRules),
  });

  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState("");
  const [threshold, setThreshold] = React.useState<number | null>(null);
  const effectiveThreshold = threshold ?? settings.data?.autoMatchThreshold ?? 75;

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
      <Stack p={{ xs: 0, sm: 1 }} gap={2.5}>
        <Typography variant="h5">Закупки и накладные · {org?.name}</Typography>
        <Alert severity="info">
          Поставщики, приёмки (накладные), возвраты и оплаты поставщикам. Модуль отдельный от «Склада»: остатки и товары
          работают и без него. Страница — <Link to="/invoices">Накладные</Link>.
        </Alert>
        {settings.isFetching && <LinearProgress />}
        {error && <Alert severity="error">{error}</Alert>}
        <Typography color="text.secondary">
          Права сотрудников (кто оформляет накладные, проводит оплаты, распознаёт по фото) назначаются в ролях и правах —
          группа «Закупки». Сам модуль подключает администратор платформы; здесь только общие правила организации.
        </Typography>

        <Stack gap={1.5} sx={{ mt: 1, p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
          <Typography variant="h6">Распознавание накладных по фото</Typography>
          <Typography variant="body2" color="text.secondary">
            Сотрудник фотографирует накладную — форма заполняется поставщиком, номером, датой и позициями. Ничего не
            проводится автоматически: позиции проверяет и подтверждает человек.
          </Typography>
          {settings.data && !settings.data.recognitionAvailable && (
            <Alert severity="warning">
              Распознавание не настроено на сервере (нет ключа провайдера) — кнопка «По фото» будет неактивна, фото к
              накладным сохраняются как обычно.
            </Alert>
          )}
          {settings.data && (
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
