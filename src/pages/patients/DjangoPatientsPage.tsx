import React from "react";
import {
  Box,
  Card,
  CardContent,
  Stack,
  Typography,
  CircularProgress,
  IconButton,
  Tooltip,
  Divider,
  Chip,
  Drawer,
  TextField,
  Button,
  MenuItem,
  Switch,
  FormControlLabel,
  ToggleButtonGroup,
  ToggleButton,
  InputAdornment,
} from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";

import { PageHeader } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useNotification } from "@refinedev/core";
import { usePermissions } from "../../hooks/usePermissions";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import {
  getPatients,
  createPatient,
  updatePatient,
} from "../../api/patients";
import type { DjangoPatient, CreatePatientPayload, UpdatePatientPayload, PatientGender } from "../../api/patients";
import type { RbacBranch } from "../../api/auth";

// ── Constants ──────────────────────────────────────────────────────────────

const GENDER_LABELS: Record<PatientGender, string> = {
  male: "Мужской",
  female: "Женский",
  unknown: "Не указан",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ru-RU");
  } catch {
    return iso;
  }
}

function formatPhone(p: string | null | undefined): string {
  return p || "—";
}

// ── Patient Form Drawer ────────────────────────────────────────────────────

interface PatientFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: (p: DjangoPatient) => void;
  initial?: DjangoPatient | null;
  branches: RbacBranch[];
  defaultBranchId?: number | null;
  canCreate: boolean;
  canUpdate: boolean;
}

const PatientFormDrawer: React.FC<PatientFormProps> = ({
  open,
  onClose,
  onSaved,
  initial,
  branches,
  defaultBranchId,
  canCreate,
  canUpdate,
}) => {
  const { open: notify } = useNotification();
  const isEdit = !!initial;
  const allowed = isEdit ? canUpdate : canCreate;

  const [fullName, setFullName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [secondaryPhone, setSecondaryPhone] = React.useState("");
  const [birthDate, setBirthDate] = React.useState("");
  const [gender, setGender] = React.useState<PatientGender>("unknown");
  const [branchId, setBranchId] = React.useState<string>("");
  const [address, setAddress] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [source, setSource] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (open) {
      setFullName(initial?.fullName ?? "");
      setPhone(initial?.phone ?? "");
      setSecondaryPhone(initial?.secondaryPhone ?? "");
      setBirthDate(initial?.birthDate ?? "");
      setGender(initial?.gender ?? "unknown");
      setBranchId(
        initial?.branch?.id != null
          ? String(initial.branch.id)
          : defaultBranchId != null
          ? String(defaultBranchId)
          : ""
      );
      setAddress(initial?.address ?? "");
      setNotes(initial?.notes ?? "");
      setSource(initial?.source ?? "");
      setIsActive(initial?.isActive ?? true);
      setErrors({});
    }
  }, [open, initial, defaultBranchId]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!fullName.trim()) errs.fullName = "ФИО обязательно";
    if (!phone.trim()) errs.phone = "Телефон обязателен";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      let saved: DjangoPatient;
      if (isEdit && initial) {
        const payload: UpdatePatientPayload = {
          fullName: fullName.trim(),
          phone: phone.trim(),
          secondaryPhone: secondaryPhone.trim() || null,
          birthDate: birthDate || null,
          gender,
          branchId: branchId ? Number(branchId) : null,
          address: address.trim() || null,
          notes: notes.trim() || null,
          source: source.trim() || null,
          isActive,
        };
        saved = await updatePatient(initial.id, payload);
      } else {
        const payload: CreatePatientPayload = {
          fullName: fullName.trim(),
          phone: phone.trim(),
          secondaryPhone: secondaryPhone.trim() || null,
          birthDate: birthDate || null,
          gender,
          branchId: branchId ? Number(branchId) : null,
          address: address.trim() || null,
          notes: notes.trim() || null,
          source: source.trim() || null,
          isActive,
        };
        saved = await createPatient(payload);
      }
      notify?.({ type: "success", message: isEdit ? "Пациент обновлён" : "Пациент создан" });
      onSaved(saved);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка сохранения";
      notify?.({ type: "error", message: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 480 } } }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Header */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: 2.5, py: 2, borderBottom: 1, borderColor: "divider" }}
        >
          <Typography variant="h6" fontWeight={600}>
            {isEdit ? "Редактировать пациента" : "Новый пациент"}
          </Typography>
          <IconButton size="small" onClick={onClose}>
            <CloseOutlined />
          </IconButton>
        </Stack>

        {/* Body */}
        <Box sx={{ flex: 1, overflowY: "auto", px: 2.5, py: 2 }}>
          {!allowed ? (
            <Typography color="text.secondary">Недостаточно прав</Typography>
          ) : (
            <Stack spacing={2}>
              <TextField
                label="ФИО"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: "" }));
                }}
                fullWidth
                size="small"
                required
                error={!!errors.fullName}
                helperText={errors.fullName}
              />
              <TextField
                label="Телефон"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (errors.phone) setErrors((prev) => ({ ...prev, phone: "" }));
                }}
                fullWidth
                size="small"
                required
                error={!!errors.phone}
                helperText={errors.phone}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PhoneOutlinedIcon fontSize="small" color="action" />
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                label="Доп. телефон"
                value={secondaryPhone}
                onChange={(e) => setSecondaryPhone(e.target.value)}
                fullWidth
                size="small"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PhoneOutlinedIcon fontSize="small" color="action" />
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                label="Дата рождения"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Пол"
                select
                value={gender}
                onChange={(e) => setGender(e.target.value as PatientGender)}
                fullWidth
                size="small"
              >
                {(["unknown", "male", "female"] as PatientGender[]).map((g) => (
                  <MenuItem key={g} value={g}>
                    {GENDER_LABELS[g]}
                  </MenuItem>
                ))}
              </TextField>
              {branches.length > 0 && (
                <TextField
                  label="Филиал"
                  select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  fullWidth
                  size="small"
                >
                  <MenuItem value="">— Не указан —</MenuItem>
                  {branches.map((b) => (
                    <MenuItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              <TextField
                label="Адрес"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                fullWidth
                size="small"
              />
              <TextField
                label="Источник"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                fullWidth
                size="small"
                placeholder="Откуда узнали о клинике"
              />
              <TextField
                label="Примечания"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                fullWidth
                size="small"
                multiline
                rows={3}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                }
                label="Активен"
              />
            </Stack>
          )}
        </Box>

        {/* Footer */}
        {allowed && (
          <Stack
            direction="row"
            spacing={1}
            justifyContent="flex-end"
            sx={{ px: 2.5, py: 2, borderTop: 1, borderColor: "divider" }}
          >
            <Button variant="outlined" onClick={onClose} disabled={saving}>
              Отмена
            </Button>
            <Button variant="contained" onClick={handleSave} disabled={saving}>
              {saving ? <CircularProgress size={18} /> : "Сохранить"}
            </Button>
          </Stack>
        )}
      </Box>
    </Drawer>
  );
};

// ── Patient Row ────────────────────────────────────────────────────────────

interface PatientRowProps {
  patient: DjangoPatient;
  canUpdate: boolean;
  onEdit: () => void;
}

const PatientRow: React.FC<PatientRowProps> = ({ patient: p, canUpdate, onEdit }) => (
  <Box sx={{ px: 2, py: 1.5, "&:hover": { bgcolor: "action.hover" } }}>
    <Stack
      direction={{ xs: "column", sm: "row" }}
      alignItems={{ xs: "flex-start", sm: "center" }}
      justifyContent="space-between"
      gap={1}
    >
      {/* Left: name + meta */}
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ minWidth: 0, flex: 1 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            bgcolor: p.isActive ? "primary.lighter" : "action.disabledBackground",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <PersonOutlinedIcon sx={{ fontSize: 20, color: p.isActive ? "primary.main" : "text.disabled" }} />
        </Box>

        <Stack sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap">
            <Typography
              variant="subtitle2"
              noWrap
              sx={{ opacity: p.isActive ? 1 : 0.55 }}
            >
              {p.fullName}
            </Typography>
            {!p.isActive && (
              <Chip
                label="Неактивен"
                size="small"
                color="default"
                sx={{ height: 18, fontSize: "0.65rem" }}
              />
            )}
          </Stack>

          <Stack direction="row" gap={1.5} flexWrap="wrap" sx={{ mt: 0.25 }}>
            <Typography variant="caption" color="text.secondary">
              {formatPhone(p.phone)}
            </Typography>
            {p.secondaryPhone && (
              <Typography variant="caption" color="text.secondary">
                {p.secondaryPhone}
              </Typography>
            )}
            {p.birthDate && (
              <Typography variant="caption" color="text.secondary">
                {formatDate(p.birthDate)}
              </Typography>
            )}
            {p.gender !== "unknown" && (
              <Typography variant="caption" color="text.secondary">
                {GENDER_LABELS[p.gender]}
              </Typography>
            )}
          </Stack>

          <Stack direction="row" gap={1.5} flexWrap="wrap" sx={{ mt: 0.125 }}>
            {p.branch && (
              <Typography variant="caption" color="text.disabled">
                {p.branch.name}
              </Typography>
            )}
            {p.source && (
              <Typography variant="caption" color="text.disabled">
                Источник: {p.source}
              </Typography>
            )}
          </Stack>
        </Stack>
      </Stack>

      {/* Right: actions */}
      {canUpdate && (
        <Tooltip title="Редактировать">
          <IconButton size="small" onClick={onEdit} sx={{ flexShrink: 0 }}>
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Stack>
  </Box>
);

// ── Main Page ──────────────────────────────────────────────────────────────

const DjangoPatientsPage: React.FC = () => {
  usePageTitle("Пациенты");

  const { hasPermission, isSuperAdmin, loading: permLoading, activeBranch, activeMembership } = usePermissions();

  const canView = isSuperAdmin() || hasPermission("patients.view");
  const canCreate = isSuperAdmin() || hasPermission("patients.create");
  const canUpdate = isSuperAdmin() || hasPermission("patients.update");

  // Available branches from active membership
  const branches: RbacBranch[] = activeMembership?.branches ?? [];
  const defaultBranchId = activeBranch?.id ?? null;

  // Data
  const [patients, setPatients] = React.useState<DjangoPatient[]>([]);
  const [loadingData, setLoadingData] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Filters
  const [search, setSearch] = React.useState("");
  const [activeFilter, setActiveFilter] = React.useState<"all" | "active" | "inactive">("all");

  // Form drawer
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DjangoPatient | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = React.useCallback(async () => {
    setLoadingData(true);
    setError(null);
    try {
      const data = await getPatients();
      setPatients(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки данных");
    } finally {
      setLoadingData(false);
    }
  }, []);

  // Refetch when permissions are ready (covers initial load + context switch)
  const activeOrgId = activeMembership?.organization?.id;
  const activeBranchId = activeBranch?.id;
  React.useEffect(() => {
    if (!permLoading && canView) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permLoading, canView, activeOrgId, activeBranchId]);

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = React.useMemo(() => {
    let list = patients;
    if (activeFilter === "active") list = list.filter((p) => p.isActive);
    if (activeFilter === "inactive") list = list.filter((p) => !p.isActive);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.fullName.toLowerCase().includes(q) ||
          (p.phone && p.phone.includes(q)) ||
          (p.secondaryPhone && p.secondaryPhone.includes(q))
      );
    }
    return list;
  }, [patients, search, activeFilter]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleEdit = (p: DjangoPatient) => {
    setEditing(p);
    setFormOpen(true);
  };

  const handleSaved = (saved: DjangoPatient) => {
    setFormOpen(false);
    setEditing(null);
    // Optimistically update list to avoid full refetch lag
    setPatients((prev) => {
      const idx = prev.findIndex((p) => p.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    // Full refetch to get server-authoritative state
    load();
  };

  // ── Guards ────────────────────────────────────────────────────────────────
  if (permLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!canView) {
    return <AccessDenied />;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <PageHeader
        title="Пациенты"
        showTitle={false}
        addButtonText={canCreate ? "Добавить пациента" : undefined}
        onAdd={canCreate ? handleAdd : undefined}
        showSearch
        searchVal={search}
        onSearchChange={setSearch}
        searchPlaceholder="Поиск по ФИО или телефону"
        loading={loadingData}
        actions={
          <ToggleButtonGroup
            size="small"
            exclusive
            value={activeFilter}
            onChange={(_, v) => { if (v) setActiveFilter(v); }}
            sx={{ height: 36 }}
          >
            <ToggleButton value="all" sx={{ px: 1.5, fontSize: "0.75rem" }}>Все</ToggleButton>
            <ToggleButton value="active" sx={{ px: 1.5, fontSize: "0.75rem" }}>Активные</ToggleButton>
            <ToggleButton value="inactive" sx={{ px: 1.5, fontSize: "0.75rem" }}>Неактивные</ToggleButton>
          </ToggleButtonGroup>
        }
      />

      <Box
        sx={(theme) => ({
          px: theme.appLayout.page.paddingX,
          pb: 2,
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        })}
      >
        {/* Stats row */}
        {!loadingData && !error && patients.length > 0 && (
          <Stack direction="row" gap={1} sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Всего: {patients.length}
            </Typography>
            {filtered.length !== patients.length && (
              <Typography variant="caption" color="text.secondary">
                · Найдено: {filtered.length}
              </Typography>
            )}
          </Stack>
        )}

        <Card
          variant="outlined"
          sx={{ flex: 1, display: "flex", flexDirection: "column" }}
        >
          <CardContent sx={{ p: 0, flex: 1, minHeight: 0, overflowY: "auto" }}>
            {loadingData ? (
              <Stack alignItems="center" sx={{ py: 6 }}>
                <CircularProgress size={28} />
              </Stack>
            ) : error ? (
              <Stack alignItems="center" spacing={1} sx={{ py: 6 }}>
                <Typography color="error" variant="body2">
                  {error}
                </Typography>
                <Button size="small" onClick={load}>
                  Повторить
                </Button>
              </Stack>
            ) : filtered.length === 0 ? (
              <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ py: 8 }}>
                <PersonOutlinedIcon sx={{ fontSize: 48, color: "text.disabled" }} />
                <Typography variant="body2" color="text.secondary">
                  {patients.length === 0
                    ? "Пациентов пока нет"
                    : "Нет пациентов, соответствующих фильтру"}
                </Typography>
                {search && (
                  <Button
                    size="small"
                    startIcon={<ClearIcon />}
                    onClick={() => setSearch("")}
                  >
                    Сбросить поиск
                  </Button>
                )}
              </Stack>
            ) : (
              <Stack divider={<Divider flexItem />}>
                {filtered.map((p) => (
                  <PatientRow
                    key={p.id}
                    patient={p}
                    canUpdate={canUpdate}
                    onEdit={() => handleEdit(p)}
                  />
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Box>

      <PatientFormDrawer
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={handleSaved}
        initial={editing}
        branches={branches}
        defaultBranchId={defaultBranchId}
        canCreate={canCreate}
        canUpdate={canUpdate}
      />
    </Box>
  );
};

export default DjangoPatientsPage;
