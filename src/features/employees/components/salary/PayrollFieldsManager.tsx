import React from "react";
import {
  alpha,
  Alert,
  Autocomplete,
  Box,
  ButtonBase,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import Add from "@mui/icons-material/AddOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import TrendingDownOutlined from "@mui/icons-material/TrendingDownOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createPayrollField,
  deletePayrollField,
  getPayrollFields,
  updatePayrollField,
  type PayrollCustomField,
  type PayrollFieldKind,
  type PayrollFieldValueType,
} from "../../../../api/payroll";
import { djangoQueryKeys } from "../../../../api/queryKeys";
import { AppButton, ConfirmDialog } from "../../../../components/ui";
import { subtleBg } from "../../../../theme/uiHelpers";

type Role = { id: number; name: string };

type Draft = {
  id: number | null;
  name: string;
  kind: PayrollFieldKind;
  valueType: PayrollFieldValueType;
  viewRoleIds: number[];
  editRoleIds: number[];
};

const NEW_DRAFT: Draft = {
  id: null,
  name: "",
  kind: "accrual",
  valueType: "amount",
  viewRoleIds: [],
  editRoleIds: [],
};

type Props = {
  open: boolean;
  onClose: () => void;
  organizationId?: number | null;
  /** Поля изменились — карточка ЗП должна перечитаться. */
  onChanged: () => void;
};

const Toggle = <K extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { key: K; label: string; hint: string }[];
  value: K;
  onChange: (key: K) => void;
  disabled?: boolean;
}) => (
  <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 1 }}>
    {options.map((o) => {
      const selected = o.key === value;
      return (
        <ButtonBase
          key={o.key}
          disabled={disabled}
          onClick={() => onChange(o.key)}
          sx={(t) => ({
            display: "block",
            textAlign: "left",
            p: 1.1,
            borderRadius: "12px",
            border: 1.5,
            borderColor: selected ? "primary.main" : "divider",
            bgcolor: selected
              ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.14 : 0.07)
              : "background.paper",
            opacity: disabled && !selected ? 0.5 : 1,
            transition: "border-color .2s ease, background-color .2s ease",
          })}
        >
          <Typography variant="body2" fontWeight={600}>{o.label}</Typography>
          <Typography variant="caption" color="text.secondary">{o.hint}</Typography>
        </ButtonBase>
      );
    })}
  </Box>
);

const roleNames = (ids: number[], roles: Role[]) =>
  ids.map((id) => roles.find((r) => r.id === id)?.name ?? `#${id}`).join(", ");

/**
 * Конструктор своих полей зарплаты: что это (начисление/удержание, сумма
 * или процент) и какие роли видят и меняют значение в карточке сотрудника.
 * Доступен с payroll.fields.manage — такой пользователь видит все поля сам.
 */
const PayrollFieldsManager: React.FC<Props> = ({ open, onClose, organizationId, onChanged }) => {
  const queryClient = useQueryClient();
  const fieldsQuery = useQuery({
    queryKey: djangoQueryKeys.payroll.fields(organizationId ?? null),
    queryFn: ({ signal }) => getPayrollFields(organizationId, signal),
    enabled: open,
    staleTime: 30_000,
  });
  const fields = fieldsQuery.data?.fields ?? [];
  const roles = fieldsQuery.data?.roles ?? [];

  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [toDelete, setToDelete] = React.useState<PayrollCustomField | null>(null);

  React.useEffect(() => {
    if (!open) {
      setDraft(null);
      setError(null);
    }
  }, [open]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: djangoQueryKeys.payroll.fields(organizationId ?? null) });
    onChanged();
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      if (draft.id == null) {
        await createPayrollField(
          {
            name: draft.name.trim(),
            kind: draft.kind,
            valueType: draft.valueType,
            viewRoleIds: draft.viewRoleIds,
            editRoleIds: draft.editRoleIds,
          },
          organizationId,
        );
      } else {
        await updatePayrollField(
          draft.id,
          {
            name: draft.name.trim(),
            viewRoleIds: draft.viewRoleIds,
            editRoleIds: draft.editRoleIds,
          },
          organizationId,
        );
      }
      setDraft(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Не удалось сохранить поле");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await deletePayrollField(toDelete.id, organizationId);
      setToDelete(null);
      if (draft?.id === toDelete.id) setDraft(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Не удалось удалить поле");
      setToDelete(null);
    } finally {
      setBusy(false);
    }
  };

  const rolePicker = (label: string, value: number[], onPick: (ids: number[]) => void, helper: string) => (
    <Autocomplete
      multiple
      size="small"
      options={roles}
      value={roles.filter((r) => value.includes(r.id))}
      onChange={(_, picked) => onPick(picked.map((r) => r.id))}
      getOptionLabel={(r) => r.name}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      disableCloseOnSelect
      disabled={busy}
      renderTags={(selected, getTagProps) =>
        selected.map((r, index) => {
          const { key, ...tagProps } = getTagProps({ index });
          return <Chip key={key} {...tagProps} label={r.name} size="small" sx={{ borderRadius: "7px" }} />;
        })
      }
      renderInput={(params) => (
        <TextField {...params} label={label} placeholder={value.length ? "" : "Выберите роли"} helperText={helper} />
      )}
    />
  );

  return (
    <>
      <Dialog
        open={open}
        onClose={busy ? undefined : onClose}
        // sm в теме проекта — 360px: ширину задаём сами.
        maxWidth={false}
        fullWidth
        PaperProps={{ sx: { borderRadius: "18px", maxWidth: 620 } }}
      >
        <DialogTitle sx={{ pb: 0.5 }}>Свои поля зарплаты</DialogTitle>
        <DialogContent>
          <Stack direction="row" gap={1} sx={{ mb: 2, color: "text.secondary" }}>
            <InfoOutlined sx={{ fontSize: 18, mt: "2px", flexShrink: 0 }} />
            <Typography variant="body2" color="text.secondary">
              Поле появляется в карточке «Зарплата» у каждого сотрудника. Кто меняет поле, тот его и видит.
              Пользователи с правом «Свои поля зарплаты» видят и меняют все поля.
            </Typography>
          </Stack>

          {fieldsQuery.isLoading ? (
            <Stack alignItems="center" sx={{ py: 4 }}>
              <CircularProgress size={24} />
            </Stack>
          ) : fieldsQuery.error ? (
            <Alert severity="error">Не удалось загрузить поля</Alert>
          ) : (
            <Stack spacing={1}>
              <AnimatePresence initial={false}>
                {fields.map((field) => (
                  <motion.div
                    key={field.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22 }}
                  >
                    <Stack
                      direction="row"
                      alignItems="center"
                      gap={1.25}
                      sx={(t) => ({
                        p: 1.25,
                        borderRadius: "12px",
                        border: 1,
                        borderColor: draft?.id === field.id ? "primary.main" : "divider",
                        bgcolor: subtleBg(t),
                      })}
                    >
                      <Box sx={{ color: field.kind === "accrual" ? "success.main" : "error.main", display: "flex" }}>
                        {field.kind === "accrual" ? <TrendingUpOutlined /> : <TrendingDownOutlined />}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {field.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                          {field.kind === "accrual" ? "Начисление" : "Удержание"} ·{" "}
                          {field.valueType === "amount" ? "сумма в месяц" : "процент"}
                          {field.valuesCount > 0 && ` · заполнено у ${field.valuesCount}`}
                        </Typography>
                        <Stack direction="row" alignItems="center" gap={0.5} sx={{ color: "text.secondary" }}>
                          <VisibilityOutlined sx={{ fontSize: 13 }} />
                          <Typography variant="caption" noWrap>
                            {field.viewRoleIds.length || field.editRoleIds.length
                              ? [
                                  field.viewRoleIds.length ? `видят: ${roleNames(field.viewRoleIds, roles)}` : "",
                                  field.editRoleIds.length ? `меняют: ${roleNames(field.editRoleIds, roles)}` : "",
                                ]
                                  .filter(Boolean)
                                  .join(" · ")
                              : "только управляющие полями"}
                          </Typography>
                        </Stack>
                      </Box>
                      <Tooltip title="Изменить">
                        <IconButton
                          size="small"
                          onClick={() =>
                            setDraft({
                              id: field.id,
                              name: field.name,
                              kind: field.kind,
                              valueType: field.valueType,
                              viewRoleIds: field.viewRoleIds,
                              editRoleIds: field.editRoleIds,
                            })
                          }
                        >
                          <EditOutlined sx={{ fontSize: 17 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Удалить">
                        <IconButton size="small" onClick={() => setToDelete(field)} sx={{ "&:hover": { color: "error.main" } }}>
                          <DeleteOutline sx={{ fontSize: 17 }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </motion.div>
                ))}
              </AnimatePresence>

              {fields.length === 0 && !draft && (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 2 }}>
                  Полей пока нет
                </Typography>
              )}

              <AnimatePresence initial={false}>
                {draft ? (
                  <motion.div
                    key="editor"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    style={{ overflow: "hidden" }}
                  >
                    <Stack
                      spacing={1.75}
                      sx={(t) => ({
                        mt: 1,
                        p: 1.75,
                        borderRadius: "14px",
                        border: 1.5,
                        borderColor: alpha(t.palette.primary.main, 0.45),
                        bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.08 : 0.04),
                      })}
                    >
                      <Typography variant="body2" fontWeight={600}>
                        {draft.id == null ? "Новое поле" : "Изменить поле"}
                      </Typography>
                      <TextField
                        size="small"
                        label="Название"
                        value={draft.name}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        placeholder="Например, «Надбавка за стаж»"
                        inputProps={{ maxLength: 100 }}
                        disabled={busy}
                        autoFocus
                      />
                      <Toggle<PayrollFieldKind>
                        options={[
                          { key: "accrual", label: "Начисление", hint: "добавляется к зарплате" },
                          { key: "deduction", label: "Удержание", hint: "вычитается из «на руки»" },
                        ]}
                        value={draft.kind}
                        onChange={(kind) => setDraft({ ...draft, kind })}
                        disabled={busy || draft.id != null}
                      />
                      <Toggle<PayrollFieldValueType>
                        options={[
                          { key: "amount", label: "Сумма в месяц", hint: "фиксированная, в сомах" },
                          {
                            key: "percent",
                            label: "Процент",
                            hint: draft.kind === "accrual" ? "от заработанного по ставкам" : "от всего начисленного",
                          },
                        ]}
                        value={draft.valueType}
                        onChange={(valueType) => setDraft({ ...draft, valueType })}
                        disabled={busy || draft.id != null}
                      />
                      {draft.id != null && (
                        <Typography variant="caption" color="text.secondary">
                          Вид и тип значения после создания не меняются: значения уже введены как суммы или проценты.
                        </Typography>
                      )}
                      {rolePicker(
                        "Кто видит",
                        draft.viewRoleIds,
                        (ids) => setDraft({ ...draft, viewRoleIds: ids }),
                        "Видят значение в карточке, но не меняют",
                      )}
                      {rolePicker(
                        "Кто меняет",
                        draft.editRoleIds,
                        (ids) => setDraft({ ...draft, editRoleIds: ids }),
                        "Меняют значение у сотрудников (и, конечно, видят)",
                      )}
                      {error && <Alert severity="error">{error}</Alert>}
                      <Stack direction="row" justifyContent="flex-end" gap={1}>
                        <AppButton variant="text" onClick={() => setDraft(null)} disabled={busy}>
                          Отмена
                        </AppButton>
                        <AppButton
                          variant="contained"
                          onClick={save}
                          loading={busy}
                          disabled={!draft.name.trim()}
                        >
                          {draft.id == null ? "Создать поле" : "Сохранить"}
                        </AppButton>
                      </Stack>
                    </Stack>
                  </motion.div>
                ) : (
                  <motion.div key="add" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <AppButton
                      fullWidth
                      variant="text"
                      startIcon={<Add />}
                      onClick={() => {
                        setError(null);
                        setDraft({ ...NEW_DRAFT });
                      }}
                      sx={(t) => ({
                        mt: 1,
                        border: "1.5px dashed",
                        borderColor: "divider",
                        borderRadius: "12px",
                        py: 1.1,
                        "&:hover": { borderColor: alpha(t.palette.primary.main, 0.5) },
                      })}
                    >
                      Новое поле
                    </AppButton>
                  </motion.div>
                )}
              </AnimatePresence>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <AppButton variant="text" onClick={onClose} disabled={busy}>
            Готово
          </AppButton>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={toDelete != null}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        loading={busy}
        variant="error"
        title="Удалить поле?"
        message={
          toDelete
            ? `«${toDelete.name}» пропадёт из карточек${
                toDelete.valuesCount > 0 ? ` вместе со значениями (заполнено у ${toDelete.valuesCount})` : ""
              }. Замороженные месяцы не изменятся, текущий пересчитается.`
            : ""
        }
        confirmText="Удалить"
      />
    </>
  );
};

export default PayrollFieldsManager;
