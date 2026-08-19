import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormHelperText,
  IconButton,
  InputLabel,
  MenuItem,
  OutlinedInput,
  Paper,
  Select,
  SelectChangeEvent,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Alert,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CampaignIcon from "@mui/icons-material/Campaign";

import {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  Announcement,
  AnnouncementCreatePayload,
} from "../../api/announcements";
import { getRoles, RbacRole } from "../../api/rbac";
import {
  getDjangoEmployees,
  DjangoEmployeeListItem,
  PaginatedDjangoEmployees,
} from "../../api/staff";
import { getBranches, DjangoBranch } from "../../api/organization";
import { djangoQueryKeys } from "../../api/queryKeys";
import { usePermissions } from "../../hooks/usePermissions";
import { SettingsLayout } from "./SettingsLayout";
import { CustomDateTimePicker } from "../../components/ui";
import dayjs from "dayjs";

export const AnnouncementsSettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { hasPermission, activeOrganization } = usePermissions();

  const canView = hasPermission("announcements.view") || hasPermission("announcements.manage");
  const canManage = hasPermission("announcements.manage");

  const [openFormDialog, setOpenFormDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [title, setTitle] = useState("Оповещение");
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<"INFO" | "WARNING" | "ERROR">("INFO");
  const [targetType, setTargetType] = useState<"ALL" | "ROLES" | "EMPLOYEES">("ALL");
  const [targetRoleIds, setTargetRoleIds] = useState<number[]>([]);
  const [targetEmployeeIds, setTargetEmployeeIds] = useState<number[]>([]);
  const [targetBranchIds, setTargetBranchIds] = useState<number[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);

  // Queries
  const { data: announcements = [], isLoading } = useQuery<Announcement[]>({
    queryKey: djangoQueryKeys.announcements.all,
    queryFn: getAnnouncements,
    enabled: canView,
  });

  const { data: roles = [] } = useQuery<RbacRole[]>({
    queryKey: ["django", "rbac", "roles", activeOrganization?.id],
    queryFn: () => getRoles(activeOrganization?.id),
    enabled: canManage && openFormDialog,
  });

  const { data: employeesData } = useQuery<PaginatedDjangoEmployees>({
    queryKey: ["django", "staff", "employees", activeOrganization?.id],
    queryFn: () => getDjangoEmployees({ pageSize: 300 }),
    enabled: canManage && openFormDialog,
  });
  const employees = employeesData?.results ?? [];

  const { data: branches = [] } = useQuery<DjangoBranch[]>({
    // orgId в ключе и в запросе: без него суперюзеру/мультиорг-пользователю
    // в выбор филиалов попадают чужие организации (см. getBranches).
    queryKey: [...djangoQueryKeys.organization.branches, activeOrganization?.id],
    queryFn: () => getBranches(activeOrganization?.id),
    enabled: canManage && openFormDialog,
  });

  const invalidateAnnouncements = () => {
    queryClient.invalidateQueries({ queryKey: djangoQueryKeys.announcements.all });
    queryClient.invalidateQueries({ queryKey: djangoQueryKeys.announcements.active });
  };

  // Mutations
  const createMutation = useMutation({
    mutationFn: createAnnouncement,
    onSuccess: () => {
      invalidateAnnouncements();
      handleCloseForm();
    },
    onError: (err: any) => {
      setFormError(err?.message || "Ошибка при создании объявления");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<AnnouncementCreatePayload> }) =>
      updateAnnouncement(id, payload),
    onSuccess: () => {
      invalidateAnnouncements();
      handleCloseForm();
    },
    onError: (err: any) => {
      setFormError(err?.message || "Ошибка при обновлении объявления");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAnnouncement,
    onSuccess: () => {
      invalidateAnnouncements();
      setDeleteTarget(null);
    },
  });

  const handleOpenCreate = () => {
    setEditingId(null);
    setTitle("Оповещение");
    setMessage("");
    setSeverity("INFO");
    setTargetType("ALL");
    setTargetRoleIds([]);
    setTargetEmployeeIds([]);
    setTargetBranchIds([]);
    setIsActive(true);
    setExpiresAt("");
    setFormError(null);
    setOpenFormDialog(true);
  };

  const handleOpenEdit = (ann: Announcement) => {
    setEditingId(ann.id);
    setTitle(ann.title);
    setMessage(ann.message);
    setSeverity(ann.severity);
    setTargetType(ann.targetType);
    setTargetRoleIds(ann.targetRoles.map((r) => r.id));
    setTargetEmployeeIds(ann.targetEmployees.map((e) => e.id));
    setTargetBranchIds(ann.targetBranches.map((b) => b.id));
    setIsActive(ann.isActive);
    setExpiresAt(ann.expiresAt ? dayjs(ann.expiresAt).format("YYYY-MM-DDTHH:mm") : "");
    setFormError(null);
    setOpenFormDialog(true);
  };

  const handleCloseForm = () => {
    setOpenFormDialog(false);
    setEditingId(null);
    setFormError(null);
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setFormError("Заполните текст сообщения.");
      return;
    }
    if (targetType === "ROLES" && targetRoleIds.length === 0) {
      setFormError("Выберите хотя бы одну роль.");
      return;
    }
    if (targetType === "EMPLOYEES" && targetEmployeeIds.length === 0) {
      setFormError("Выберите хотя бы одного сотрудника.");
      return;
    }

    const payload: AnnouncementCreatePayload = {
      title: title.trim() || "Оповещение",
      message: message.trim(),
      severity,
      targetType,
      targetRoleIds: targetType === "ROLES" ? targetRoleIds : [],
      targetEmployeeIds: targetType === "EMPLOYEES" ? targetEmployeeIds : [],
      targetBranchIds: targetType !== "EMPLOYEES" ? targetBranchIds : [],
      isActive,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleToggleActive = (ann: Announcement) => {
    updateMutation.mutate({
      id: ann.id,
      payload: { isActive: !ann.isActive },
    });
  };

  const getSeverityChip = (sev: string) => {
    switch (sev) {
      case "WARNING":
        return <Chip label="Предупреждение" color="warning" size="small" />;
      case "ERROR":
        return <Chip label="Важное" color="error" size="small" />;
      default:
        return <Chip label="Информация" color="info" size="small" />;
    }
  };

  const getStatusChip = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <Chip label="Активно" color="success" size="small" variant="outlined" />;
      case "EXPIRED":
        return <Chip label="Истёк срок" color="default" size="small" variant="outlined" />;
      default:
        return <Chip label="Деактивировано" color="warning" size="small" variant="outlined" />;
    }
  };

  const renderAudience = (ann: Announcement) => {
    let text = "Все сотрудники";
    if (ann.targetType === "ROLES") {
      text = `Роли: ${ann.targetRoles.map((r) => r.name).join(", ") || "не выбраны"}`;
    } else if (ann.targetType === "EMPLOYEES") {
      text = `Сотрудники: ${ann.targetEmployees.map((e) => e.fullName).join(", ") || "не выбраны"}`;
    }

    const branchText =
      ann.targetBranches.length > 0
        ? ` [Филиалы: ${ann.targetBranches.map((b) => b.name).join(", ")}]`
        : "";

    return text + branchText;
  };

  if (!canView) {
    return (
      <SettingsLayout>
        <Alert severity="error">У вас нет прав для просмотра объявлений клиники.</Alert>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout>
      <Stack spacing={3}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h5" fontWeight={700} gutterBottom>
              Объявления и оповещения
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Управление объявлениями и важными сообщениями клиники для сотрудников.
            </Typography>
          </Box>
          {canManage && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleOpenCreate}
            >
              Создать объявление
            </Button>
          )}
        </Stack>

        <Card variant="outlined">
          <TableContainer component={Paper} elevation={0}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Заголовок / Сообщение</TableCell>
                  <TableCell>Важность</TableCell>
                  <TableCell>Аудитория</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell>Автор / Создано</TableCell>
                  <TableCell>Истекает</TableCell>
                  {canManage && <TableCell align="right">Действия</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      Загрузка...
                    </TableCell>
                  </TableRow>
                ) : announcements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Box sx={{ py: 3, textAlign: "center" }}>
                        <CampaignIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
                        <Typography color="text.secondary">
                          Объявлений пока нет.
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : (
                  announcements.map((ann) => (
                    <TableRow key={ann.id} hover>
                      <TableCell sx={{ maxWidth: 300 }}>
                        <Typography variant="subtitle2" fontWeight={600}>
                          {ann.title}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {ann.message}
                        </Typography>
                      </TableCell>
                      <TableCell>{getSeverityChip(ann.severity)}</TableCell>
                      <TableCell>
                        <Typography variant="body2">{renderAudience(ann)}</Typography>
                      </TableCell>
                      <TableCell>{getStatusChip(ann.status)}</TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>
                          {ann.creator?.fullName ?? "—"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {dayjs(ann.createdAt).format("DD.MM.YYYY HH:mm")}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {ann.expiresAt
                            ? dayjs(ann.expiresAt).format("DD.MM.YYYY HH:mm")
                            : "Бессрочно"}
                        </Typography>
                      </TableCell>
                      {canManage && (
                        <TableCell align="right">
                          <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
                            <Switch
                              size="small"
                              checked={ann.isActive}
                              onChange={() => handleToggleActive(ann)}
                              title={ann.isActive ? "Деактивировать" : "Активировать"}
                            />
                            <IconButton
                              size="small"
                              onClick={() => handleOpenEdit(ann)}
                              color="primary"
                              title="Редактировать"
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => setDeleteTarget(ann)}
                              color="error"
                              title="Удалить"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </Stack>

      {/* Dialog: Create / Edit Announcement */}
      <Dialog open={openFormDialog} onClose={handleCloseForm} maxWidth="sm" fullWidth>
        <form onSubmit={handleSubmitForm}>
          <DialogTitle>
            {editingId ? "Редактирование объявления" : "Новое объявление"}
          </DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2.5}>
              {formError && <Alert severity="error">{formError}</Alert>}

              <TextField
                label="Заголовок"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                fullWidth
                required
              />

              <TextField
                label="Текст сообщения"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                fullWidth
                multiline
                rows={3}
                required
              />

              <FormControl fullWidth>
                <InputLabel id="severity-label">Важность</InputLabel>
                <Select
                  labelId="severity-label"
                  value={severity}
                  label="Важность"
                  onChange={(e) => setSeverity(e.target.value as any)}
                >
                  <MenuItem value="INFO">Информация (Синий)</MenuItem>
                  <MenuItem value="WARNING">Предупреждение (Оранжевый)</MenuItem>
                  <MenuItem value="ERROR">Важное (Красный)</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel id="target-type-label">Целевая аудитория</InputLabel>
                <Select
                  labelId="target-type-label"
                  value={targetType}
                  label="Целевая аудитория"
                  onChange={(e) => setTargetType(e.target.value as any)}
                >
                  <MenuItem value="ALL">Все сотрудники</MenuItem>
                  <MenuItem value="ROLES">Выбранные роли</MenuItem>
                  <MenuItem value="EMPLOYEES">Конкретные сотрудники</MenuItem>
                </Select>
              </FormControl>

              {targetType === "ROLES" && (
                <FormControl fullWidth>
                  <InputLabel id="roles-select-label">Целевые роли</InputLabel>
                  <Select
                    labelId="roles-select-label"
                    multiple
                    value={targetRoleIds}
                    onChange={(e: SelectChangeEvent<number[]>) =>
                      setTargetRoleIds(
                        typeof e.target.value === "string"
                          ? e.target.value.split(",").map(Number)
                          : e.target.value
                      )
                    }
                    input={<OutlinedInput label="Целевые роли" />}
                    renderValue={(selected) =>
                      roles
                        .filter((r) => selected.includes(r.id))
                        .map((r) => r.name)
                        .join(", ")
                    }
                  >
                    {roles.map((r) => (
                      <MenuItem key={r.id} value={r.id}>
                        {r.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {targetType === "EMPLOYEES" && (
                <FormControl fullWidth>
                  <InputLabel id="employees-select-label">Целевые сотрудники</InputLabel>
                  <Select
                    labelId="employees-select-label"
                    multiple
                    value={targetEmployeeIds}
                    onChange={(e: SelectChangeEvent<number[]>) =>
                      setTargetEmployeeIds(
                        typeof e.target.value === "string"
                          ? e.target.value.split(",").map(Number)
                          : e.target.value
                      )
                    }
                    input={<OutlinedInput label="Целевые сотрудники" />}
                    renderValue={(selected) =>
                      employees
                        .filter((emp: DjangoEmployeeListItem) => selected.includes(emp.id))
                        .map((emp: DjangoEmployeeListItem) => emp.fullName)
                        .join(", ")
                    }
                  >
                    {employees.map((emp: DjangoEmployeeListItem) => (
                      <MenuItem key={emp.id} value={emp.id}>
                        {emp.fullName}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {targetType !== "EMPLOYEES" && (
                <FormControl fullWidth>
                  <InputLabel id="branches-select-label">Фильтр по филиалам</InputLabel>
                  <Select
                    labelId="branches-select-label"
                    multiple
                    value={targetBranchIds}
                    onChange={(e: SelectChangeEvent<number[]>) =>
                      setTargetBranchIds(
                        typeof e.target.value === "string"
                          ? e.target.value.split(",").map(Number)
                          : e.target.value
                      )
                    }
                    input={<OutlinedInput label="Фильтр по филиалам" />}
                    renderValue={(selected) =>
                      branches
                        .filter((b) => selected.includes(b.id))
                        .map((b) => b.name)
                        .join(", ")
                    }
                  >
                    {branches.map((b) => (
                      <MenuItem key={b.id} value={b.id}>
                        {b.name}
                      </MenuItem>
                    ))}
                  </Select>
                  <FormHelperText>
                    Оставьте пустым, чтобы объявление действовало во всех филиалах клиники.
                  </FormHelperText>
                </FormControl>
              )}

              <CustomDateTimePicker
                label="Дата и время окончания"
                value={expiresAt ? dayjs(expiresAt) : null}
                onChange={(next) => setExpiresAt(next && next.isValid() ? next.format("YYYY-MM-DDTHH:mm") : "")}
                shortYearMode="future"
                slotProps={{
                  textField: {
                    fullWidth: true,
                    helperText: "Оставьте пустым для бессрочного объявления",
                  },
                }}
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                }
                label="Активно"
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={handleCloseForm} color="inherit">
              Отмена
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingId ? "Сохранить" : "Создать"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Dialog: Delete Confirmation */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Удаление объявления</DialogTitle>
        <DialogContent>
          <Typography>
            Вы действительно хотите удалить объявление{" "}
            <strong>«{deleteTarget?.title}»</strong>?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDeleteTarget(null)} color="inherit">
            Отмена
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            disabled={deleteMutation.isPending}
          >
            Удалить
          </Button>
        </DialogActions>
      </Dialog>
    </SettingsLayout>
  );
};

export default AnnouncementsSettingsPage;
