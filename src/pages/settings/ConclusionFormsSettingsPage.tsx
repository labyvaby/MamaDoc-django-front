import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import EditOutlined from "@mui/icons-material/EditOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { SettingsLayout } from "./SettingsLayout";
import { getSpecializations, type DjangoSpecialization } from "../../api/staff";
import { getServices } from "../../api/catalog";
import { parseBackendError } from "../../api/expenses";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { ApiError } from "../../api/client";
import {
  CONCLUSION_FORMS_BACKEND,
  createConclusionForm,
  deleteConclusionForm,
  getConclusionForms,
  updateConclusionForm,
  type ConclusionFormPayload,
  type ConclusionFormTemplate,
} from "../../api/conclusionForms";
import { FormBuilderDialog } from "../../components/conclusion-forms/FormBuilderDialog";
import {
  StaleDefaultsNotice,
  buildThemeConfigWithoutDefaults,
  readStaleDefaults,
} from "../../components/conclusion-forms/StaleDefaultsNotice";
import { updateOrganization } from "../../api/organization";
import { useCanChecker } from "../../hooks/useCan";
import { retryAuth } from "../../hooks/usePermissions";

/**
 * Настройки → Бланки заключений.
 *
 * Список собранных бланков и вход в конструктор. Бланк — это макет печатного
 * документа (лист, шапка, поля), который врач заполняет в карточке заключения;
 * сам текст заключения хранится по-прежнему в полях приёма.
 */

const PAGE_LABEL: Record<string, string> = {
  "A4-portrait": "A4, вертикальный",
  "A4-landscape": "A4, горизонтальный",
  "A5-portrait": "A5, вертикальный",
  "A5-landscape": "A5, горизонтальный",
};

const ConclusionFormsSettingsPage: React.FC = () => {
  usePageTitle("Бланки заключений");
  const {
    activeOrganization,
    activeMembership,
    activeBranch,
    loading: permLoading,
  } = usePermissions();
  const orgId = useApiOrgId();
  const queryClient = useQueryClient();

  const [builderOpen, setBuilderOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ConclusionFormTemplate | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<ConclusionFormTemplate | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  // ── Старые правила подстановки ─────────────────────────────────────────────
  // До 03.09.2026 «бланк по умолчанию» задавался отдельным списком в
  // themeConfig организации: полей под привязки на модели бланка не было.
  // Теперь они есть, подстановка читает только их, а ключ остаётся в конфиге
  // мёртвым грузом — показываем, что там записано, и даём убрать (см.
  // StaleDefaultsNotice).
  const { can } = useCanChecker();
  const canEditOrganization = can("organization.update");
  const [staleCleared, setStaleCleared] = React.useState(false);
  const [staleClearing, setStaleClearing] = React.useState(false);
  const [staleError, setStaleError] = React.useState<string | null>(null);
  const staleRules = React.useMemo(
    () => (staleCleared ? [] : readStaleDefaults(activeOrganization?.themeConfig)),
    [activeOrganization, staleCleared],
  );

  const handleClearStale = async () => {
    if (!activeOrganization) return;
    setStaleClearing(true);
    setStaleError(null);
    try {
      await updateOrganization(activeOrganization.id, {
        // ⚠ Патч строго поверх текущего themeConfig: там же палитра CRM,
        // лендинг `/site` и терминология организации.
        themeConfig: buildThemeConfigWithoutDefaults(activeOrganization.themeConfig),
      });
      setStaleCleared(true);
      // /auth/me/ — источник themeConfig для всего приложения.
      retryAuth();
    } catch (e) {
      setStaleError(parseBackendError(e));
    } finally {
      setStaleClearing(false);
    }
  };

  const formsQuery = useQuery({
    queryKey: djangoQueryKeys.conclusionForms.list(orgId ?? null),
    queryFn: ({ signal }) => getConclusionForms(orgId, signal, { includeInactive: true }),
    enabled: !permLoading,
    retry: (count, err) => {
      if ([403, 429].includes((err as ApiError)?.status)) return false;
      return count < 1;
    },
  });

  const specsQuery = useQuery({
    queryKey: djangoQueryKeys.staff.specializations(orgId ?? null),
    queryFn: ({ signal }) => getSpecializations(signal),
    enabled: !permLoading,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    retry: (count, err) => {
      if ([403, 429].includes((err as ApiError)?.status)) return false;
      return count < 1;
    },
  });

  // Услуги нужны только секции «Бланк по умолчанию»: правило привязывает бланк
  // к услуге строки заключения (см. api/conclusionFormDefaults).
  const servicesQuery = useQuery({
    queryKey: djangoQueryKeys.catalog.services({ orgId: orgId ?? null }),
    queryFn: ({ signal }) => getServices({ organizationId: orgId ?? undefined }, undefined, signal),
    enabled: !permLoading,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    retry: (count, err) => {
      if ([403, 429].includes((err as ApiError)?.status)) return false;
      return count < 1;
    },
  });

  const forms = formsQuery.data ?? [];
  const specializations: DjangoSpecialization[] = specsQuery.data ?? [];
  const services = servicesQuery.data ?? [];
  // Филиалы берём из membership: своего списка филиалов у страницы нет, а
  // бланк закрепляют за теми, куда у администратора есть доступ.
  const branches = activeMembership?.branches ?? (activeBranch ? [activeBranch] : []);
  const specName = (id: number) => specializations.find((s) => s.id === id)?.name ?? `#${id}`;
  const serviceName = (id: number) => services.find((s) => s.id === id)?.name ?? `Услуга #${id}`;
  const branchName = (id: number) => branches.find((b) => b.id === id)?.name ?? `Филиал #${id}`;

  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: djangoQueryKeys.conclusionForms.list(orgId ?? null),
    });

  const handleSave = async (payload: ConclusionFormPayload) => {
    setSaving(true);
    setSaveError(null);
    try {
      if (editing) {
        await updateConclusionForm(orgId, editing.id, payload);
      } else {
        await createConclusionForm(orgId, payload);
      }
      invalidate();
      setBuilderOpen(false);
      setEditing(null);
    } catch (e) {
      setSaveError(parseBackendError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setActionError(null);
    try {
      await deleteConclusionForm(orgId, pendingDelete.id);
      invalidate();
      setPendingDelete(null);
    } catch (e) {
      setActionError(parseBackendError(e));
    }
  };

  return (
    <SettingsLayout>
      <Stack spacing={3}>
        <Stack
          direction="row"
          alignItems="flex-start"
          justifyContent="space-between"
          gap={2}
          flexWrap="wrap"
        >
          <Box>
            <Typography variant="h6" fontWeight={600}>
              Бланки заключений
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Печатные формы приёма: лист, шапка клиники и поля, которые заполняет врач.
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddOutlined />}
            onClick={() => {
              setEditing(null);
              setSaveError(null);
              setBuilderOpen(true);
            }}
          >
            Новый бланк
          </Button>
        </Stack>

        {!CONCLUSION_FORMS_BACKEND && (
          <Alert severity="warning">
            Бланки сохраняются только в этом браузере: на сервере хранилище шаблонов ещё
            не реализовано. Собранный макет не увидят коллеги и он пропадёт при очистке
            данных браузера.
          </Alert>
        )}

        {actionError && (
          <Alert severity="error" onClose={() => setActionError(null)}>
            {actionError}
          </Alert>
        )}

        {formsQuery.error && (
          <Alert severity="error">{parseBackendError(formsQuery.error)}</Alert>
        )}

        {/* Мёртвые правила из themeConfig — до таблицы: администратор должен
            увидеть их раньше, чем начнёт гадать, почему бланк не подставился. */}
        <StaleDefaultsNotice
          rules={staleRules}
          forms={forms}
          services={servicesQuery.data ?? []}
          branches={branches}
          canClear={canEditOrganization}
          clearing={staleClearing}
          error={staleError}
          onClear={handleClearStale}
        />

        {formsQuery.isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : forms.length === 0 ? (
          <Alert severity="info">
            Бланков пока нет. Соберите первый — например, протокол УЗИ или карту осмотра.
          </Alert>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Название</TableCell>
                  <TableCell>Лист</TableCell>
                  <TableCell>Подстановка</TableCell>
                  <TableCell>Специализации</TableCell>
                  <TableCell align="right">Полей</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {forms.map((form) => (
                  <TableRow key={form.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {form.name}
                      </Typography>
                      {form.title && (
                        <Typography variant="caption" color="text.secondary">
                          {form.title}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {PAGE_LABEL[`${form.pageSize}-${form.orientation}`] ?? form.pageSize}
                    </TableCell>
                    {/* Когда бланк раскроется врачу сам: услуги, филиалы и
                        признак запасного — то же, что решает resolveFormForScope. */}
                    <TableCell>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {form.isDefault && (
                          <Chip size="small" color="primary" variant="outlined" label="Запасной" />
                        )}
                        <Chip
                          size="small"
                          variant="outlined"
                          label={
                            form.serviceIds.length === 0
                              ? "Любая услуга"
                              : form.serviceIds.length === 1
                                ? serviceName(form.serviceIds[0])
                                : `Услуг: ${form.serviceIds.length}`
                          }
                        />
                        <Chip
                          size="small"
                          variant="outlined"
                          label={
                            form.branchIds.length === 0
                              ? "Все филиалы"
                              : form.branchIds.length === 1
                                ? branchName(form.branchIds[0])
                                : `Филиалов: ${form.branchIds.length}`
                          }
                        />
                      </Stack>
                    </TableCell>
                    <TableCell>
                      {form.specializationIds.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          Все
                        </Typography>
                      ) : (
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                          {form.specializationIds.map((id) => (
                            <Chip key={id} size="small" variant="outlined" label={specName(id)} />
                          ))}
                        </Stack>
                      )}
                    </TableCell>
                    <TableCell align="right">{form.fields.length}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Редактировать">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setEditing(form);
                            setSaveError(null);
                            setBuilderOpen(true);
                          }}
                        >
                          <EditOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Удалить">
                        <IconButton size="small" onClick={() => setPendingDelete(form)}>
                          <DeleteOutline fontSize="small" color="error" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Stack>

      <FormBuilderDialog
        open={builderOpen}
        onClose={() => {
          setBuilderOpen(false);
          setEditing(null);
        }}
        template={editing}
        specializations={specializations}
        services={services}
        branches={branches}
        clinicName={activeOrganization?.name ?? ""}
        clinicLogoUrl={activeOrganization?.logoUrl}
        busy={saving}
        error={saveError}
        onSave={handleSave}
      />

      <Dialog open={pendingDelete !== null} onClose={() => setPendingDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Удалить бланк?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            «{pendingDelete?.name}» будет удалён. Уже сохранённые заключения не изменятся.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)}>Отмена</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>
            Удалить
          </Button>
        </DialogActions>
      </Dialog>
    </SettingsLayout>
  );
};

export default ConclusionFormsSettingsPage;
