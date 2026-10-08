import React from "react";
import {
  Alert,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControlLabel,
  FormHelperText,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import BiotechOutlined from "@mui/icons-material/BiotechOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import LocalOfferOutlined from "@mui/icons-material/LocalOfferOutlined";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import SyncOutlined from "@mui/icons-material/SyncOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { usePageTitle } from "../../hooks/usePageTitle";
import { SettingsLayout } from "./SettingsLayout";
import { InfoTile } from "../../components/ui";
import {
  getLabConfig,
  connectLabAccounts,
  startLabCatalogSync,
  type LabConfig,
} from "../../api/lab";
import { getErrorMessage } from "../../api/client";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import dayjs from "dayjs";

import { formatDateRu } from "../../utility/format";
import {
  findLabAccountProblem,
  labConfigToForm,
  labAccountsFormToInput,
  type LabBranchRow,
  type LabSettingsForm,
} from "./labSettingsForm";

/**
 * Настройка подключения к ЛИС ExpressLab — то, что раньше делал только
 * суперпользователь в Django-админке (`OrganizationLabConfig`,
 * `BranchLabRegistry`). Право `lab.settings.manage`.
 *
 * Синк каталога отсюда не запускается: он идёт больше часа и гоняется
 * отдельным контейнером — здесь только видно, шёл ли он и когда.
 */
const LabSettingsPage: React.FC = () => {
  usePageTitle("Лаборатория (ЛИС)");
  const queryClient = useQueryClient();

  const [form, setForm] = React.useState<LabSettingsForm | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [syncBusy, setSyncBusy] = React.useState(false);
  const [syncError, setSyncError] = React.useState<string | null>(null);

  const configQuery = useQuery({
    queryKey: djangoQueryKeys.lab.config,
    queryFn: ({ signal }) => getLabConfig(signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const config = configQuery.data;

  // Только первое заполнение: рефетч (реконнект, invalidate `lab.all` из
  // дровера) с изменившимися счётчиками зеркала не должен стирать
  // несохранённые правки. После сохранения форма берётся из ответа PUT.
  React.useEffect(() => {
    if (config) setForm((prev) => prev ?? labConfigToForm(config));
  }, [config]);

  const patch = (change: Partial<LabSettingsForm>) => {
    setSaveError(null);
    setForm((prev) => (prev ? { ...prev, ...change } : prev));
  };
  const patchBranch = (branchId: number, change: Partial<LabBranchRow>) => {
    setSaveError(null);
    setForm((prev) =>
      prev
        ? {
            ...prev,
            branches: prev.branches.map((row) =>
              row.branchId === branchId ? { ...row, ...change } : row,
            ),
          }
        : prev,
    );
  };

  const problem = form ? findLabAccountProblem(form) : null;

  const handleSave = async () => {
    if (!form || problem) return;
    setBusy(true);
    setSaveError(null);
    try {
      const next: LabConfig = await connectLabAccounts(labAccountsFormToInput(form));
      queryClient.setQueryData(djangoQueryKeys.lab.config, next);
      // Настройки раздела (`configured`, плата за пробирки) читает дровер
      // приёма — после сохранения ему нужно узнать, что раздел ожил.
      void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.lab.settings });
      setForm(labConfigToForm(next));
      setSaved(true);
    } catch (err) {
      setSaveError(getErrorMessage(err, "Не удалось сохранить настройки"));
    } finally {
      setBusy(false);
    }
  };

  const mirror = config?.mirror;
  const sync = config?.sync;
  const syncRunning = sync?.state === "running";

  // Пока обход идёт, страница переспрашивает состояние: задача пишет итог
  // в базу, а не в ответ, и без опроса «идёт» висело бы до перезагрузки.
  React.useEffect(() => {
    if (!syncRunning) return undefined;
    const timer = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.lab.config });
    }, 10000);
    return () => window.clearInterval(timer);
  }, [syncRunning, queryClient]);

  const handleSync = async () => {
    setSyncBusy(true);
    setSyncError(null);
    try {
      const next = await startLabCatalogSync();
      queryClient.setQueryData(djangoQueryKeys.lab.config, next);
    } catch (err) {
      setSyncError(getErrorMessage(err, "Не удалось запустить обновление"));
    } finally {
      setSyncBusy(false);
    }
  };

  return (
    <SettingsLayout>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h6" fontWeight={600}>
            Лаборатория (ЛИС ExpressLab)
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Введите логин и пароль, выданные ExpressLab каждому филиалу.
            Данные подключения определятся автоматически после проверки доступов.
          </Typography>
        </Box>

        {configQuery.error && (
          <Alert severity="error">
            {getErrorMessage(configQuery.error, "Не удалось загрузить настройки")}
          </Alert>
        )}

        {configQuery.isLoading && (
          <Stack alignItems="center" py={4}>
            <CircularProgress size={24} />
          </Stack>
        )}

        {config && !config.configured && (
          <Alert severity="warning">
            Для подключения укажите доступы хотя бы одного филиала и нажмите
            «Проверить и сохранить».
          </Alert>
        )}

        {form && (
          <>
            <Accordion disableGutters elevation={0} sx={{ maxWidth: 760 }}>
              <AccordionSummary expandIcon={<ExpandMoreOutlined />}>
                <Typography component="span" variant="subtitle2">Общая учётная запись — необязательно</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Только если лаборатория выдала один доступ для всех филиалов.
                </Typography>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Логин в ЛИС"
                size="small"
                value={form.lisUsername}
                onChange={(e) => patch({ lisUsername: e.target.value })}
                disabled={busy}
                autoComplete="off"
                helperText="Общий логин клиники, если он выдан"
                sx={{ maxWidth: 320 }}
              />
              <TextField
                label="Пароль в ЛИС"
                size="small"
                type="password"
                value={form.lisPassword}
                onChange={(e) => patch({ lisPassword: e.target.value })}
                disabled={busy}
                autoComplete="new-password"
                placeholder={form.hasPassword ? "сохранён — оставьте пустым" : ""}
                helperText={
                  form.hasPassword
                    ? "Пустое поле — пароль не меняется"
                    : "Пароль от учётной записи ЛИС"
                }
                sx={{ maxWidth: 320 }}
              />
            </Stack>
              </AccordionDetails>
            </Accordion>

            <Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={form.chargeInstruments}
                    onChange={(e) => patch({ chargeInstruments: e.target.checked })}
                    disabled={busy}
                  />
                }
                label="Брать с пациента плату за пробирки и взятие"
              />
              <FormHelperText>
                Цены расходников приходят из ЛИС. Выключено — они видны в наборе, но в сумму
                заказа не входят.
              </FormHelperText>
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" fontWeight={600}>
                Подключение филиалов
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Для филиала достаточно логина и пароля. Если после 17:00 используется
                другой доступ, включите две смены.
              </Typography>
            </Box>

            <Stack spacing={3} divider={<Divider />} sx={{ maxWidth: 760 }}>
              {form.branches.map((row) => (
                <Stack key={row.branchId} spacing={2}>
                  <Typography variant="subtitle2" fontWeight={600}>
                    {row.branchName}
                  </Typography>
                  <Typography variant="body2" color={row.lisRegistryId ? "success.main" : "text.secondary"}>
                    {row.lisRegistryId ? "Настроен" : "Доступы ещё не заданы"}
                  </Typography>
                  <Box>
                    <FormControlLabel
                      control={<Switch checked={row.eveningEnabled} disabled={busy}
                        onChange={(e) => patchBranch(row.branchId, { eveningEnabled: e.target.checked })} />}
                      label="Две смены: до 17:00 и с 17:00"
                    />
                    <FormHelperText>
                      {row.eveningEnabled
                        ? "Автоматически по времени Бишкека. Повторная отправка и печать используют смену исходного заказа."
                        : "Одна учётная запись на весь день. Доступы второй смены сохраняются при отключении переключателя."}
                    </FormHelperText>
                  </Box>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                    <TextField
                      fullWidth
                      label={row.eveningEnabled ? "Логин до 17:00" : "Логин филиала в ЛИС"}
                      size="small"
                      value={row.lisUsername}
                      onChange={(e) => patchBranch(row.branchId, { lisUsername: e.target.value, clearCredentials: false })}
                      disabled={busy}
                      autoComplete="off"
                      helperText="Логин, выданный ExpressLab этому филиалу"
                    />
                    <TextField
                      fullWidth
                      label={row.eveningEnabled ? "Пароль до 17:00" : "Пароль филиала в ЛИС"}
                      size="small"
                      type="password"
                      value={row.lisPassword}
                      onChange={(e) => patchBranch(row.branchId, { lisPassword: e.target.value, clearCredentials: false })}
                      disabled={busy}
                      autoComplete="new-password"
                      placeholder={row.hasPassword ? "сохранён — оставьте пустым" : ""}
                      helperText={row.hasPassword ? "Пустое поле сохраняет пароль; при смене логина введите его заново" : "Пароль, выданный для этого филиала"}
                    />
                  </Stack>
                  {!row.eveningEnabled && form.lisUsername && (row.lisUsername || row.hasPassword || row.lisPassword) && (
                    <Box>
                      <Button
                        size="small"
                        disabled={busy || row.eveningEnabled}
                        onClick={() => patchBranch(row.branchId, {
                          lisUsername: "", lisPassword: "", hasPassword: false,
                          clearCredentials: true,
                        })}
                      >
                        Использовать общую учётную запись
                      </Button>
                    </Box>
                  )}
                  {row.eveningEnabled && (
                    <Stack spacing={2}>
                      <Typography variant="subtitle2">Смена с 17:00</Typography>
                      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                        <TextField fullWidth size="small" label="Логин с 17:00" disabled={busy}
                          value={row.eveningLisUsername} autoComplete="off"
                          onChange={(e) => patchBranch(row.branchId, { eveningLisUsername: e.target.value, clearEveningCredentials: false })} />
                        <TextField fullWidth size="small" label="Пароль с 17:00" type="password" disabled={busy}
                          value={row.eveningLisPassword} autoComplete="new-password"
                          onChange={(e) => patchBranch(row.branchId, { eveningLisPassword: e.target.value, clearEveningCredentials: false })}
                          placeholder={row.eveningHasPassword ? "сохранён — оставьте пустым" : ""}
                          helperText={row.eveningHasPassword ? "Пустое поле сохраняет пароль; при смене логина введите его заново" : "Пароль вечерней учётной записи"} />
                      </Stack>
                    </Stack>
                  )}
                  {!row.eveningEnabled && (row.eveningLisUsername || row.eveningHasPassword || row.eveningLisPassword) && (
                    <Box>
                      <Button size="small" disabled={busy} onClick={() => patchBranch(row.branchId, {
                        eveningLisUsername: "", eveningLisPassword: "", eveningHasPassword: false,
                        clearEveningCredentials: true,
                      })}>Удалить доступы второй смены</Button>
                      <FormHelperText>Старые заказы этой смены потребуют восстановления доступов для повтора или печати.</FormHelperText>
                    </Box>
                  )}
                </Stack>
              ))}
              {form.branches.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  Активных филиалов нет — сначала заведите филиал.
                </Typography>
              )}
            </Stack>

            {problem && <Alert severity="warning">{problem}</Alert>}
            {saveError && <Alert severity="error">{saveError}</Alert>}

            <Box>
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={busy || problem !== null}
                startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                {busy ? "Проверяем доступы…" : "Проверить и сохранить"}
              </Button>
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" fontWeight={600}>
                Зеркало каталога ЛИС
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Анализы, цены, пробирки, памятки, врачи и типы клиента — копия справочников
                лаборатории. Обновляется сама раз в неделю; кнопкой — когда лаборатория
                поменяла прайс. Полный проход идёт в фоне до часа, страницу можно закрыть.
              </Typography>
            </Box>

            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
              <Button
                variant="outlined"
                onClick={handleSync}
                disabled={busy || syncBusy || syncRunning || !config?.configured}
                startIcon={
                  syncBusy || syncRunning ? (
                    <CircularProgress size={16} />
                  ) : (
                    <SyncOutlined />
                  )
                }
              >
                {syncRunning ? "Обновление идёт…" : "Обновить каталог"}
              </Button>
              {sync && sync.state !== "idle" && (
                <Typography variant="body2" color="text.secondary">
                  {syncRunning
                    ? `начато ${dayjs(sync.startedAt).format("DD.MM.YYYY HH:mm")}`
                    : sync.state === "ok"
                      ? `последнее обновление ${dayjs(sync.finishedAt).format("DD.MM.YYYY HH:mm")}`
                      : ""}
                </Typography>
              )}
            </Stack>
            {sync?.state === "failed" && sync.error && (
              <Alert severity="error">Лаборатория отказала: {sync.error}</Alert>
            )}
            {syncError && <Alert severity="error">{syncError}</Alert>}
            {mirror && (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(5, minmax(0, 1fr))" },
                  gap: 1.25,
                  maxWidth: 960,
                }}
              >
                <InfoTile icon={<ScienceOutlined />} label="Анализы" value={mirror.tests} />
                <InfoTile icon={<GroupsOutlined />} label="Врачи ЛИС" value={mirror.doctors} />
                <InfoTile icon={<LocalOfferOutlined />} label="Типы клиента" value={mirror.clientTypes} />
                <InfoTile icon={<BiotechOutlined />} label="Пробирки" value={mirror.instruments} />
                <InfoTile
                  icon={<SyncOutlined />}
                  label="Последний синк"
                  value={mirror.lastSyncedAt ? formatDateRu(mirror.lastSyncedAt) : "не было"}
                  active={!!mirror.lastSyncedAt}
                />
              </Box>
            )}
          </>
        )}
      </Stack>

      <Snackbar
        open={saved}
        autoHideDuration={3000}
        onClose={() => setSaved(false)}
        message="Настройки лаборатории сохранены"
      />
    </SettingsLayout>
  );
};

export default LabSettingsPage;
