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
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import StarOutlined from "@mui/icons-material/StarOutlined";
import StarBorderOutlined from "@mui/icons-material/StarBorderOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { useCan } from "../../hooks/useCan";
import { SettingsLayout } from "./SettingsLayout";
import {
  getCashlessMethods,
  createCashlessMethod,
  updateCashlessMethod,
  deleteCashlessMethod,
  isCashlessMethodInUseError,
  cashlessMethodInUseMessage,
  type DjangoCashlessMethod,
} from "../../api/cashlessMethods";
import { getBranches, type DjangoBranch } from "../../api/organization";
import { parseBackendError } from "../../api/expenses";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { ApiError } from "../../api/client";
import { useT } from "../../i18n/VerticalProvider";

// ── Диалог создания / редактирования ─────────────────────────────────────────

type EditDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Редактируемый способ; null → режим создания. */
  method: DjangoCashlessMethod | null;
  organizationId?: number;
  /** Филиалы организации для выбора скоупа при создании. */
  branches: DjangoBranch[];
  onSaved: () => void;
};

const CashlessMethodDialog: React.FC<EditDialogProps> = ({
  open,
  onClose,
  method,
  organizationId,
  branches,
  onSaved,
}) => {
  const { t } = useT("settings");
  const isEdit = method !== null;
  const [name, setName] = React.useState("");
  const [branchId, setBranchId] = React.useState<number | "">("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName(method?.name ?? "");
      setBranchId(method?.branchId ?? "");
      setError(null);
      setBusy(false);
    }
  }, [open, method]);

  const nameValid = name.trim().length >= 2;

  const handleSubmit = async () => {
    if (!nameValid) {
      setError(t("cashlessMethods.dialog.nameTooShort"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isEdit) {
        // branchId не отправляем: бэк отвечает 400 на перенос способа между
        // филиалами — прошлые операции остались бы с недоступным способом.
        await updateCashlessMethod(method.id, { name: name.trim() });
      } else {
        await createCashlessMethod({
          name: name.trim(),
          branchId: branchId === "" ? null : Number(branchId),
          organizationId,
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(parseBackendError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        {isEdit
          ? t("cashlessMethods.dialog.editTitle")
          : t("cashlessMethods.dialog.createTitle")}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label={t("cashlessMethods.dialog.nameLabel")}
            size="small"
            fullWidth
            autoFocus
            value={name}
            onChange={(e) => {
              setError(null);
              setName(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && nameValid && !busy) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            disabled={busy}
            inputProps={{ maxLength: 128 }}
            helperText={t("cashlessMethods.dialog.nameHelper")}
          />
          {/* Скоуп задаётся только при создании: перенос между филиалами
              не поддерживается (см. handleSubmit). */}
          {isEdit ? (
            <TextField
              label={t("cashlessMethods.dialog.branchLabel")}
              size="small"
              fullWidth
              value={method.branchName ?? t("cashlessMethods.allBranches")}
              disabled
              helperText={t("cashlessMethods.dialog.branchLocked")}
            />
          ) : (
            <TextField
              select
              label={t("cashlessMethods.dialog.branchLabel")}
              size="small"
              fullWidth
              value={branchId}
              onChange={(e) => {
                setError(null);
                setBranchId(e.target.value === "" ? "" : Number(e.target.value));
              }}
              disabled={busy}
              helperText={t("cashlessMethods.dialog.branchHelper")}
            >
              <MenuItem value="">{t("cashlessMethods.allBranches")}</MenuItem>
              {branches.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t("common:actions.cancel")}
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={busy || !nameValid}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {busy
            ? t("common:state.saving")
            : isEdit
              ? t("common:actions.save")
              : t("common:actions.add")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Главный компонент ────────────────────────────────────────────────────────

const CashlessMethodsSettingsPage: React.FC = () => {
  const { t } = useT("settings");
  usePageTitle(t("cashlessMethods.title"));
  const { isSuperAdmin, activeOrganization, memberships, loading: permLoading } = usePermissions();
  const canManage = useCan("finance.manage");
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DjangoCashlessMethod | null>(null);
  const [togglingId, setTogglingId] = React.useState<number | null>(null);
  const [toggleError, setToggleError] = React.useState<string | null>(null);
  /** Способ, для которого показываем подтверждение скрытия. */
  const [hiding, setHiding] = React.useState<DjangoCashlessMethod | null>(null);
  /** Способ, для которого показываем подтверждение удаления. */
  const [deleting, setDeleting] = React.useState<DjangoCashlessMethod | null>(null);
  /**
   * Почему удаление не прошло. `inUse` — способ уже стоит в платежах, расходах
   * или движениях склада (409). `unsupported` — на сервере ещё старая версия
   * справочника, где detail-роут разрешает только PATCH (405): фронт может
   * оказаться на проде раньше бэкенда, и сырое «Метод 'DELETE' не разрешён»
   * пользователю ничего не объясняет. В обоих случаях диалог перестраивается в
   * предложение скрыть — уводить обратно в таблицу за другой кнопкой незачем.
   */
  const [deleteBlocked, setDeleteBlocked] = React.useState<"inUse" | "unsupported" | null>(null);
  /**
   * Сообщение бэка из 409 — единственное место, где есть количества операций.
   * Пусто, пока сообщение приходит на английском (см. cashlessMethodInUseMessage):
   * тогда в диалоге остаётся только наш текст, без числа.
   */
  const [deleteBlockedDetail, setDeleteBlockedDetail] = React.useState<string | null>(null);

  const isSuper = isSuperAdmin();
  const isMultiOrg = (memberships ?? []).length > 1;
  const orgRequired = isSuper || isMultiOrg;
  const needsOrg = orgRequired && !activeOrganization;
  const orgId = orgRequired ? (activeOrganization?.id ?? undefined) : undefined;

  const methodsQuery = useQuery({
    queryKey: djangoQueryKeys.cashlessMethods.list(orgId ?? null),
    queryFn: ({ signal }) =>
      getCashlessMethods(signal, {
        includeInactive: true,
        organizationId: orgId,
      }),
    enabled: !permLoading && !needsOrg,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    retry: (count, err) => {
      if ([403, 404, 429].includes((err as ApiError)?.status)) return false;
      return count < 1;
    },
  });

  // Филиалы нужны только для выбора скоупа при создании; сам список способов
  // приходит с branchName джойном, так что таблица от этого запроса не зависит.
  const branchesQuery = useQuery({
    queryKey: [...djangoQueryKeys.organization.branches, orgId ?? null],
    queryFn: () => getBranches(orgId),
    enabled: !permLoading && !needsOrg && canManage,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  // Активные сверху, скрытые — в конце: скрытый способ выпал из работы, и
  // держать его вперемешку с рабочими значит каждый раз перечитывать статусы.
  // Способ по умолчанию — первым среди активных: он в кассе подставляется сам,
  // и искать его глазами в алфавитном списке неудобно.
  const methods = React.useMemo(() => {
    const list = methodsQuery.data ?? [];
    return [...list].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.name.localeCompare(b.name, "ru");
    });
  }, [methodsQuery.data]);
  const hiddenCount = methods.filter((m) => !m.isActive).length;
  // 404 = эндпоинта ещё нет на бэке (тикет backend_ticket_cashless_methods.md).
  // Сырое «Page not found» ничего не объясняет — показываем причину словами.
  const notImplemented = (methodsQuery.error as ApiError)?.status === 404;

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ["django", "cashless-methods"],
    });
  };

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (method: DjangoCashlessMethod) => {
    setEditing(method);
    setDialogOpen(true);
  };

  const setActive = async (method: DjangoCashlessMethod, isActive: boolean) => {
    setTogglingId(method.id);
    setToggleError(null);
    try {
      await updateCashlessMethod(method.id, { isActive });
      invalidate();
      setHiding(null);
    } catch (e) {
      setToggleError(parseBackendError(e));
    } finally {
      setTogglingId(null);
    }
  };

  // Скрытие спрашиваем: способ пропадёт из кассы у всех сотрудников сразу.
  // Возврат безобиден — делаем без диалога.
  const handleActiveClick = (method: DjangoCashlessMethod) => {
    if (method.isActive) setHiding(method);
    else void setActive(method, true);
  };

  /**
   * Дефолт снимает предыдущий сам на бэке, поэтому шлём один PATCH и
   * перечитываем список — иначе прежний дефолт остался бы отмеченным в таблице.
   * Повторный клик по отмеченному способу снимает дефолт: филиал возвращается
   * к ручному выбору.
   */
  const setDefault = async (method: DjangoCashlessMethod, isDefault: boolean) => {
    setTogglingId(method.id);
    setToggleError(null);
    try {
      await updateCashlessMethod(method.id, { isDefault });
      invalidate();
    } catch (e) {
      setToggleError(parseBackendError(e));
    } finally {
      setTogglingId(null);
    }
  };

  const openDelete = (method: DjangoCashlessMethod) => {
    setDeleteBlocked(null);
    setDeleteBlockedDetail(null);
    setDeleting(method);
  };

  const handleDelete = async (method: DjangoCashlessMethod) => {
    setTogglingId(method.id);
    setToggleError(null);
    try {
      await deleteCashlessMethod(method.id);
      invalidate();
      setDeleting(null);
    } catch (e) {
      // Способ уже в операциях (или бэк ещё без удаления) — предлагаем скрытие
      // прямо в этом же диалоге.
      if (isCashlessMethodInUseError(e)) {
        setDeleteBlocked("inUse");
        setDeleteBlockedDetail(cashlessMethodInUseMessage(e));
      } else if ((e as ApiError)?.status === 405) {
        setDeleteBlocked("unsupported");
        setDeleteBlockedDetail(null);
      } else {
        setToggleError(parseBackendError(e));
        setDeleting(null);
      }
    } finally {
      setTogglingId(null);
    }
  };

  /** Скрытие из диалога удаления: тот же PATCH, но закрываем этот диалог. */
  const handleHideFromDelete = async (method: DjangoCashlessMethod) => {
    await setActive(method, false);
    setDeleting(null);
    setDeleteBlocked(null);
  };

  // Текст диалога удаления: подтверждение, «уже использован» (со счётчиком от
  // бэка отдельной строкой или без него) и «сервер ещё не умеет удалять».
  const deleteDialogText = (() => {
    const name = deleting?.name ?? "";
    const active = deleting?.isActive ?? false;
    if (deleteBlocked === "unsupported") {
      return active
        ? t("cashlessMethods.deleteDialog.unsupportedText")
        : t("cashlessMethods.deleteDialog.unsupportedHiddenText");
    }
    if (deleteBlocked === "inUse") {
      // Со счётчиком имя способа уже названо строкой выше — не повторяем.
      if (deleteBlockedDetail) {
        return active
          ? t("cashlessMethods.deleteDialog.blockedHint")
          : t("cashlessMethods.deleteDialog.blockedHintHidden");
      }
      return active
        ? t("cashlessMethods.deleteDialog.blockedText", { name })
        : t("cashlessMethods.deleteDialog.blockedHiddenText", { name });
    }
    return t("cashlessMethods.deleteDialog.text", { name });
  })();

  return (
    <SettingsLayout>
      <Stack spacing={3}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2} flexWrap="wrap">
          <Box>
            <Typography variant="h6" fontWeight={600}>
              {t("cashlessMethods.title")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("cashlessMethods.description")}
            </Typography>
            {canManage && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {t("cashlessMethods.deleteHint")}
              </Typography>
            )}
          </Box>
          {canManage && (
            <Button
              variant="contained"
              size="small"
              startIcon={<AddOutlined />}
              onClick={openCreate}
              disabled={needsOrg || permLoading}
            >
              {t("cashlessMethods.addButton")}
            </Button>
          )}
        </Stack>

        {needsOrg && <Alert severity="info">{t("cashlessMethods.needsOrg")}</Alert>}

        {toggleError && (
          <Alert severity="error" onClose={() => setToggleError(null)}>
            {toggleError}
          </Alert>
        )}

        {methodsQuery.error && !needsOrg && (
          <Alert severity={notImplemented ? "info" : "error"}>
            {notImplemented
              ? t("cashlessMethods.notImplemented")
              : parseBackendError(methodsQuery.error)}
          </Alert>
        )}

        {methodsQuery.isLoading && !needsOrg && (
          <Stack alignItems="center" py={4}>
            <CircularProgress size={24} />
          </Stack>
        )}

        {!methodsQuery.isLoading && !needsOrg && methods.length === 0 && !methodsQuery.error && (
          <Box sx={{ py: 6, textAlign: "center" }}>
            <Typography variant="body2" color="text.disabled">
              {t("cashlessMethods.empty")}
            </Typography>
          </Box>
        )}

        {methods.length > 0 && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>{t("cashlessMethods.columns.name")}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t("cashlessMethods.columns.branch")}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t("cashlessMethods.columns.status")}</TableCell>
                  {canManage && (
                    <TableCell sx={{ fontWeight: 600 }} align="right">
                      {t("cashlessMethods.columns.actions")}
                    </TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {methods.map((method) => (
                  <TableRow
                    key={method.id}
                    hover
                    sx={method.isActive ? undefined : { opacity: 0.6 }}
                  >
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <span>{method.name}</span>
                        {method.isDefault && (
                          <Chip
                            label={t("cashlessMethods.status.default")}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      {method.branchName ?? (
                        <Typography component="span" variant="body2" color="text.secondary">
                          {t("cashlessMethods.allBranches")}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={
                          method.isActive
                            ? t("cashlessMethods.status.active")
                            : t("cashlessMethods.status.hidden")
                        }
                        size="small"
                        color={method.isActive ? "success" : "default"}
                        variant="outlined"
                      />
                    </TableCell>
                    {canManage && (
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                          {/* Скрытый способ дефолтом быть не может — бэк такую
                              установку игнорирует, поэтому кнопки у него нет. */}
                          {method.isActive && (
                            <Tooltip
                              title={
                                method.isDefault
                                  ? t("cashlessMethods.tooltips.unsetDefault")
                                  : t("cashlessMethods.tooltips.setDefault")
                              }
                            >
                              <span>
                                <IconButton
                                  size="small"
                                  color={method.isDefault ? "primary" : "default"}
                                  onClick={() => void setDefault(method, !method.isDefault)}
                                  disabled={togglingId === method.id}
                                >
                                  {method.isDefault ? (
                                    <StarOutlined fontSize="small" />
                                  ) : (
                                    <StarBorderOutlined fontSize="small" />
                                  )}
                                </IconButton>
                              </span>
                            </Tooltip>
                          )}
                          <Tooltip title={t("cashlessMethods.tooltips.edit")}>
                            <span>
                              <IconButton
                                size="small"
                                onClick={() => openEdit(method)}
                                disabled={togglingId === method.id}
                              >
                                <EditOutlined fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title={t("cashlessMethods.tooltips.delete")}>
                            <span>
                              <IconButton
                                size="small"
                                onClick={() => openDelete(method)}
                                disabled={togglingId === method.id}
                              >
                                <DeleteOutlineOutlined fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          {/* Текстом, а не иконкой: «глаз» читается как что угодно,
                              а действие тут единственное вместо удаления. */}
                          <Button
                            size="small"
                            color={method.isActive ? "inherit" : "primary"}
                            onClick={() => handleActiveClick(method)}
                            disabled={togglingId === method.id}
                            startIcon={
                              togglingId === method.id ? (
                                <CircularProgress size={14} color="inherit" />
                              ) : method.isActive ? (
                                <VisibilityOffOutlined fontSize="small" />
                              ) : (
                                <VisibilityOutlined fontSize="small" />
                              )
                            }
                          >
                            {method.isActive
                              ? t("cashlessMethods.actions.hide")
                              : t("cashlessMethods.actions.restore")}
                          </Button>
                        </Stack>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {hiddenCount > 0 && (
          <Typography variant="caption" color="text.secondary">
            {t("cashlessMethods.hiddenFootnote", { count: hiddenCount })}
          </Typography>
        )}
      </Stack>

      {/* Подтверждение скрытия: способ разом исчезает из кассы у всех. */}
      <Dialog
        open={hiding !== null}
        onClose={togglingId !== null ? undefined : () => setHiding(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t("cashlessMethods.hideDialog.title")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t("cashlessMethods.hideDialog.text", { name: hiding?.name ?? "" })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHiding(null)} disabled={togglingId !== null}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="contained"
            onClick={() => hiding && void setActive(hiding, false)}
            disabled={togglingId !== null}
            startIcon={
              togglingId !== null ? <CircularProgress size={16} color="inherit" /> : undefined
            }
          >
            {t("cashlessMethods.actions.hide")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Удаление: способ без операций уходит совсем, использованный бэк не
          отдаёт — тогда диалог превращается в предложение скрыть. */}
      <Dialog
        open={deleting !== null}
        onClose={togglingId !== null ? undefined : () => setDeleting(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {deleteBlocked === "inUse"
            ? t("cashlessMethods.deleteDialog.blockedTitle")
            : deleteBlocked === "unsupported"
              ? t("cashlessMethods.deleteDialog.unsupportedTitle")
              : t("cashlessMethods.deleteDialog.title")}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1}>
            {/* Счётчик операций приходит только текстом ошибки — показываем его
                первым, а своей строкой объясняем, что с этим делать. */}
            {deleteBlocked && deleteBlockedDetail && (
              <Typography variant="body2" color="text.primary">
                {deleteBlockedDetail}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              {deleteDialogText}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)} disabled={togglingId !== null}>
            {deleteBlocked ? t("common:actions.close") : t("common:actions.cancel")}
          </Button>
          {deleteBlocked ? (
            // Скрывать уже скрытый способ нечего — остаётся только закрыть.
            deleting?.isActive && (
              <Button
                variant="contained"
                onClick={() => deleting && void handleHideFromDelete(deleting)}
                disabled={togglingId !== null}
                startIcon={
                  togglingId !== null ? <CircularProgress size={16} color="inherit" /> : undefined
                }
              >
                {t("cashlessMethods.actions.hide")}
              </Button>
            )
          ) : (
            <Button
              variant="contained"
              color="error"
              onClick={() => deleting && void handleDelete(deleting)}
              disabled={togglingId !== null}
              startIcon={
                togglingId !== null ? <CircularProgress size={16} color="inherit" /> : undefined
              }
            >
              {t("common:actions.delete")}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <CashlessMethodDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        method={editing}
        organizationId={orgId}
        branches={branchesQuery.data ?? []}
        onSaved={invalidate}
      />
    </SettingsLayout>
  );
};

export default CashlessMethodsSettingsPage;
