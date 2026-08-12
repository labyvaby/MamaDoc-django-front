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
  const { activeOrganization, loading: permLoading } = usePermissions();
  const orgId = useApiOrgId();
  const queryClient = useQueryClient();

  const [builderOpen, setBuilderOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ConclusionFormTemplate | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<ConclusionFormTemplate | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

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

  const forms = formsQuery.data ?? [];
  const specializations: DjangoSpecialization[] = specsQuery.data ?? [];
  const specName = (id: number) => specializations.find((s) => s.id === id)?.name ?? `#${id}`;

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
