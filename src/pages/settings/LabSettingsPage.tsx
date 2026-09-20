import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControlLabel,
  FormHelperText,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import BiotechOutlined from "@mui/icons-material/BiotechOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import LocalOfferOutlined from "@mui/icons-material/LocalOfferOutlined";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import SyncOutlined from "@mui/icons-material/SyncOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { usePageTitle } from "../../hooks/usePageTitle";
import { SettingsLayout } from "./SettingsLayout";
import { InfoTile } from "../../components/ui";
import { getLabConfig, saveLabConfig, type LabConfig } from "../../api/lab";
import { getErrorMessage } from "../../api/client";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { formatDateRu } from "../../utility/format";
import {
  findLabSettingsProblem,
  labConfigToForm,
  labFormToInput,
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

  const problem = form ? findLabSettingsProblem(form) : null;

  const handleSave = async () => {
    if (!form || problem) return;
    setBusy(true);
    setSaveError(null);
    try {
      const next: LabConfig = await saveLabConfig(labFormToInput(form));
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

  return (
    <SettingsLayout>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h6" fontWeight={600}>
            Лаборатория (ЛИС ExpressLab)
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Идентификаторы выдаёт ExpressLab при подключении клиники: код организации,
            врач по умолчанию и точка регистрации с лабораторией-исполнителем для каждого
            филиала. Без точки регистрации филиал анализы не принимает.
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
            Раздел ещё не подключён: приём анализов недоступен, пока не заполнены код
            организации и хотя бы одна точка регистрации.
          </Alert>
        )}

        {form && (
          <>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Код организации в ЛИС"
                size="small"
                value={form.lisOrganizationId}
                onChange={(e) => patch({ lisOrganizationId: e.target.value })}
                disabled={busy}
                inputMode="numeric"
                helperText="organization_id из договора с ExpressLab"
                sx={{ maxWidth: 320 }}
              />
              <TextField
                label="Врач по умолчанию в ЛИС"
                size="small"
                value={form.lisDoctorId}
                onChange={(e) => patch({ lisDoctorId: e.target.value })}
                disabled={busy}
                inputMode="numeric"
                helperText="doctor_id, если направивший врач не выбран"
                sx={{ maxWidth: 320 }}
              />
            </Stack>

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
                Точки регистрации по филиалам
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Пара «точка регистрации + лаборатория» из ЛИС. Пустые поля — филиал
                анализы не принимает.
              </Typography>
            </Box>

            <Table size="small" sx={{ maxWidth: 760 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Филиал</TableCell>
                  <TableCell>Точка регистрации (registry_id)</TableCell>
                  <TableCell>Лаборатория (laboratory_id)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {form.branches.map((row) => (
                  <TableRow key={row.branchId}>
                    <TableCell sx={{ fontWeight: 600 }}>{row.branchName}</TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.lisRegistryId}
                        onChange={(e) => patchBranch(row.branchId, { lisRegistryId: e.target.value })}
                        disabled={busy}
                        inputMode="numeric"
                        placeholder="не задана"
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.lisLaboratoryId}
                        onChange={(e) =>
                          patchBranch(row.branchId, { lisLaboratoryId: e.target.value })
                        }
                        disabled={busy}
                        inputMode="numeric"
                        placeholder="не задана"
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {form.branches.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <Typography variant="body2" color="text.secondary">
                        Активных филиалов нет — сначала заведите филиал.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {problem && <Alert severity="warning">{problem}</Alert>}
            {saveError && <Alert severity="error">{saveError}</Alert>}

            <Box>
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={busy || problem !== null}
                startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                {busy ? "Сохраняем…" : "Сохранить"}
              </Button>
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" fontWeight={600}>
                Зеркало каталога ЛИС
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Каталог, врачи и типы клиента копируются из ЛИС командой синхронизации
                (`sync_lab_catalog`); её запускает администратор платформы — полный проход
                занимает больше часа.
              </Typography>
            </Box>
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
