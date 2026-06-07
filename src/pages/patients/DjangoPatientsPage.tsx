import React from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import ConstructionOutlined from "@mui/icons-material/ConstructionOutlined";
import dayjs from "dayjs";
import "dayjs/locale/ru";

dayjs.locale("ru");

import { PageHeader, AppBottomSheet } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useNotification } from "@refinedev/core";
import { usePermissions } from "../../hooks/usePermissions";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import {
  getPatients,
  createPatient,
  updatePatient,
} from "../../api/patients";
import type {
  DjangoPatient,
  CreatePatientPayload,
  UpdatePatientPayload,
  PatientGender,
} from "../../api/patients";
import {
  getPatientBalance,
  type PatientBalance,
} from "../../api/patientBalance";
import { getAppointments, type DjangoAppointment } from "../../api/appointments";
import type { RbacBranch } from "../../api/auth";

import PatientListPanel from "./components/PatientListPanel";
import PatientCard from "./components/PatientCard";
import PatientHistoryPanel from "./components/PatientHistoryPanel";
import BalanceTopUpDrawer from "./components/BalanceTopUpDrawer";
import AppointmentDetailsPanel from "../appointments/components/AppointmentDetailsPanel";
import DjangoAddPatientDrawer from "../../components/patients/DjangoAddPatientDrawer";

// ── Constants / helpers ──────────────────────────────────────────────────────

const GENDER_LABELS: Record<PatientGender, string> = {
  male: "Мужской",
  female: "Женский",
  unknown: "Не указан",
};

// ── Patient add/edit drawer (Django API) ─────────────────────────────────────

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
          : "",
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
      const common = {
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
      if (isEdit && initial) {
        saved = await updatePatient(initial.id, common as UpdatePatientPayload);
      } else {
        saved = await createPatient(common as CreatePatientPayload);
      }
      notify?.({ type: "success", message: isEdit ? "Пациент обновлён" : "Пациент создан" });
      onSaved(saved);
    } catch (e) {
      notify?.({ type: "error", message: e instanceof Error ? e.message : "Ошибка сохранения" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: "100%", sm: 480 } } }}>
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 2, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="h6" fontWeight={600}>
            {isEdit ? "Редактировать пациента" : "Новый пациент"}
          </Typography>
          <IconButton size="small" onClick={onClose}>
            <CloseOutlined />
          </IconButton>
        </Stack>

        <Box sx={{ flex: 1, overflowY: "auto", px: 2.5, py: 2 }}>
          {!allowed ? (
            <Typography color="text.secondary">Недостаточно прав</Typography>
          ) : (
            <Stack spacing={2}>
              <TextField
                label="ФИО"
                value={fullName}
                onChange={(e) => { setFullName(e.target.value); if (errors.fullName) setErrors((p) => ({ ...p, fullName: "" })); }}
                fullWidth size="small" required error={!!errors.fullName} helperText={errors.fullName}
              />
              <TextField
                label="Телефон"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); if (errors.phone) setErrors((p) => ({ ...p, phone: "" })); }}
                fullWidth size="small" required error={!!errors.phone} helperText={errors.phone}
                InputProps={{ startAdornment: <InputAdornment position="start"><PhoneOutlinedIcon fontSize="small" color="action" /></InputAdornment> }}
              />
              <TextField
                label="Доп. телефон"
                value={secondaryPhone}
                onChange={(e) => setSecondaryPhone(e.target.value)}
                fullWidth size="small"
                InputProps={{ startAdornment: <InputAdornment position="start"><PhoneOutlinedIcon fontSize="small" color="action" /></InputAdornment> }}
              />
              <TextField label="Дата рождения" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} />
              <TextField label="Пол" select value={gender} onChange={(e) => setGender(e.target.value as PatientGender)} fullWidth size="small">
                {(["unknown", "male", "female"] as PatientGender[]).map((g) => (
                  <MenuItem key={g} value={g}>{GENDER_LABELS[g]}</MenuItem>
                ))}
              </TextField>
              {branches.length > 0 && (
                <TextField label="Филиал" select value={branchId} onChange={(e) => setBranchId(e.target.value)} fullWidth size="small">
                  <MenuItem value="">— Не указан —</MenuItem>
                  {branches.map((b) => (
                    <MenuItem key={b.id} value={String(b.id)}>{b.name}</MenuItem>
                  ))}
                </TextField>
              )}
              <TextField label="Адрес" value={address} onChange={(e) => setAddress(e.target.value)} fullWidth size="small" />
              <TextField label="Источник" value={source} onChange={(e) => setSource(e.target.value)} fullWidth size="small" placeholder="Откуда узнали о клинике" />
              <TextField label="Примечания" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth size="small" multiline rows={3} />
              <FormControlLabel control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />} label="Активен" />
            </Stack>
          )}
        </Box>

        {allowed && (
          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ px: 2.5, py: 2, borderTop: 1, borderColor: "divider" }}>
            <Button variant="outlined" onClick={onClose} disabled={saving}>Отмена</Button>
            <Button variant="contained" onClick={handleSave} disabled={saving}>
              {saving ? <CircularProgress size={18} /> : "Сохранить"}
            </Button>
          </Stack>
        )}
      </Box>
    </Drawer>
  );
};

// ── "В разработке" placeholder for Old conclusions tab ───────────────────────

const OldConclusionsPlaceholder: React.FC = () => (
  <Box
    sx={{
      height: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 1.5,
      p: 3,
      color: "text.secondary",
      border: "1px dashed",
      borderColor: "divider",
      borderRadius: 1,
      bgcolor: "background.paper",
    }}
  >
    <ConstructionOutlined sx={{ fontSize: 36, color: "primary.main", opacity: 0.7 }} />
    <Typography variant="subtitle1" fontWeight={600} align="center">
      Старые заключения в разработке
    </Typography>
    <Typography variant="body2" align="center" sx={{ maxWidth: 320 }}>
      Перенос архивных заключений на новый backend ещё в работе.
    </Typography>
  </Box>
);

// ── Main page ────────────────────────────────────────────────────────────────

const DjangoPatientsPage: React.FC = () => {
  usePageTitle("Все пациенты");

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const isTablet = useMediaQuery(theme.breakpoints.between("md", "lg"));
  const isDesktop = useMediaQuery(theme.breakpoints.up("lg"));

  const {
    hasPermission,
    isSuperAdmin,
    loading: permLoading,
    activeBranch,
    activeMembership,
  } = usePermissions();

  const canView = isSuperAdmin() || hasPermission("patients.view");
  const canCreate = isSuperAdmin() || hasPermission("patients.create");
  const canUpdate = isSuperAdmin() || hasPermission("patients.update");
  const canViewFinance = isSuperAdmin() || hasPermission("finance.view");

  const branches: RbacBranch[] = activeMembership?.branches ?? [];
  const defaultBranchId = activeBranch?.id ?? null;

  // ── List data ──────────────────────────────────────────────────────────────
  const [patients, setPatients] = React.useState<DjangoPatient[]>([]);
  const [loadingData, setLoadingData] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  React.useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const [selected, setSelected] = React.useState<DjangoPatient | null>(null);

  // ── Selected patient: balance + history (Django API, AbortSignal) ──────────
  const [balance, setBalance] = React.useState<PatientBalance | null>(null);
  const [history, setHistory] = React.useState<DjangoAppointment[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [historyError, setHistoryError] = React.useState<string | null>(null);

  // ── Drawers / tabs ─────────────────────────────────────────────────────────
  const [addOpen, setAddOpen] = React.useState(false);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DjangoPatient | null>(null);
  const [topUpOpen, setTopUpOpen] = React.useState(false);
  const [historyDetail, setHistoryDetail] = React.useState<DjangoAppointment | null>(null);
  const [mergeInfoOpen, setMergeInfoOpen] = React.useState(false);

  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [mobileTab, setMobileTab] = React.useState(0);
  const [tabletTab, setTabletTab] = React.useState(0);
  const [desktopRightTab, setDesktopRightTab] = React.useState(0);

  // ── Load list ──────────────────────────────────────────────────────────────
  const load = React.useCallback(async (signal?: AbortSignal) => {
    setLoadingData(true);
    setError(null);
    try {
      const data = await getPatients(signal);
      setPatients(data);
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Ошибка загрузки данных");
    } finally {
      setLoadingData(false);
    }
  }, []);

  const activeOrgId = activeMembership?.organization?.id;
  const activeBranchId = activeBranch?.id;
  React.useEffect(() => {
    if (permLoading || !canView) return;
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permLoading, canView, activeOrgId, activeBranchId]);

  // Keep selected patient in sync with fresh list data (without losing selection)
  React.useEffect(() => {
    if (!selected) return;
    const fresh = patients.find((p) => p.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients]);

  // Load balance + history for the selected patient; cancel on switch (no stale data)
  React.useEffect(() => {
    if (!selected) {
      setBalance(null);
      setHistory([]);
      setHistoryError(null);
      return;
    }
    const ctrl = new AbortController();
    const pid = selected.id;
    setBalance(null);
    setHistory([]);
    setHistoryError(null);
    setHistoryLoading(true);

    if (canViewFinance) {
      getPatientBalance(pid, ctrl.signal)
        .then((b) => setBalance(b))
        .catch(() => { /* ignore (abort / 404) */ });
    }

    getAppointments({ patientId: pid }, ctrl.signal)
      .then((rows) => {
        const sorted = [...rows].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
        setHistory(sorted);
      })
      .catch((e) => {
        if ((e as { name?: string })?.name === "AbortError") return;
        setHistoryError(e instanceof Error ? e.message : "Ошибка загрузки истории");
      })
      .finally(() => setHistoryLoading(false));

    return () => ctrl.abort();
  }, [selected?.id, canViewFinance]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = React.useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        (p.phone && p.phone.toLowerCase().includes(q)) ||
        (p.secondaryPhone && p.secondaryPhone.toLowerCase().includes(q)),
    );
  }, [patients, debouncedSearch]);

  // ── Derived "last appointment" for the card ──────────────────────────────────
  const last = history[0];
  const lastDateTime = last ? dayjs(last.scheduledAt).format("D MMMM YYYY, HH:mm") : undefined;
  const lastService = last
    ? last.services.length === 1
      ? last.services[0].service?.name ?? undefined
      : last.services.length > 1
      ? `${last.services.length} услуг`
      : undefined
    : undefined;
  const lastComplaints = last?.complaints ?? undefined;

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleSelect = (p: DjangoPatient) => {
    setSelected(p);
    setDesktopRightTab(0);
    setTabletTab(0);
    if (isMobile) {
      setMobileTab(0);
      setMobileOpen(true);
    }
  };

  const handleAdd = () => setAddOpen(true);
  const handleEdit = () => { if (selected) { setEditing(selected); setFormOpen(true); } };

  const handleMerge = () => setMergeInfoOpen(true);

  const handleSaved = (saved: DjangoPatient) => {
    setFormOpen(false);
    setEditing(null);
    setPatients((prev) => {
      const idx = prev.findIndex((p) => p.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
    setSelected(saved); // keep selected card fresh, no full reload
  };

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (permLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!canView) return <AccessDenied />;

  // ── Shared panel nodes ────────────────────────────────────────────────────────
  const cardNode = (
    <PatientCard
      patient={selected}
      balance={balance}
      lastDateTime={lastDateTime}
      lastService={lastService}
      lastComplaints={lastComplaints}
      onEdit={canUpdate ? handleEdit : undefined}
      onTopUp={canUpdate ? () => setTopUpOpen(true) : undefined}
      onMerge={canUpdate ? handleMerge : undefined}
    />
  );

  const historyNode = (
    <PatientHistoryPanel
      selected={!!selected}
      loading={historyLoading}
      error={historyError}
      history={history}
      canViewFinance={canViewFinance}
      onClick={(appt) => setHistoryDetail(appt)}
    />
  );

  const listNode = (
    <PatientListPanel
      loading={loadingData}
      error={error}
      patients={filtered}
      selectedId={selected?.id ?? null}
      onSelect={handleSelect}
    />
  );

  const noSelection = (
    <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed", borderColor: "divider", borderRadius: 1, p: 2, bgcolor: "background.paper" }}>
      <Typography color="text.secondary">Выберите пациента слева</Typography>
    </Box>
  );

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <PageHeader
        title="Все пациенты"
        showTitle={false}
        addButtonText="Добавить пациент"
        onAdd={canCreate ? handleAdd : undefined}
        showSearch
        searchVal={search}
        onSearchChange={setSearch}
        searchPlaceholder="Поиск..."
        loading={loadingData}
      />

      <Box
        sx={(t) => ({
          px: t.appLayout.page.paddingX,
          pb: 1,
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "row",
          gap: 2,
          overflow: "hidden",
        })}
      >
        {/* Left: patient list */}
        <Box sx={{ flex: isMobile ? "1 1 auto" : isTablet ? "5 1 0" : "3 1 0", minWidth: 0, height: "100%" }}>
          {listNode}
        </Box>

        {/* Tablet (md–lg): single right column with tabs Карточка / История / Старые */}
        {isTablet && (
          <Box sx={{ flex: "7 1 0", minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
            {selected ? (
              <>
                <Tabs value={tabletTab} onChange={(_, v) => setTabletTab(v)} variant="fullWidth" sx={{ flexShrink: 0, mb: 1 }}>
                  <Tab label="Карточка" />
                  <Tab label="История" />
                  <Tab label="Старые зак." />
                </Tabs>
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  {tabletTab === 0 && cardNode}
                  {tabletTab === 1 && historyNode}
                  {tabletTab === 2 && <OldConclusionsPlaceholder />}
                </Box>
              </>
            ) : (
              noSelection
            )}
          </Box>
        )}

        {/* Desktop (>= lg): three columns — card + (history / old conclusions tabs) */}
        {isDesktop && (
          <>
            <Box sx={{ flex: "3.5 1 0", minWidth: 0, height: "100%" }}>
              {selected ? cardNode : (
                <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed", borderColor: "divider", borderRadius: 1, bgcolor: "background.paper" }}>
                  <Typography color="text.secondary">Карточка пациента</Typography>
                </Box>
              )}
            </Box>
            <Box sx={{ flex: "5.5 1 0", minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
              <Tabs value={desktopRightTab} onChange={(_, v) => setDesktopRightTab(v)} sx={{ flexShrink: 0, borderBottom: 1, borderColor: "divider", mb: 1 }}>
                <Tab label="История приёмов" />
                <Tab label="Старые заключения" />
              </Tabs>
              <Box sx={{ flex: 1, minHeight: 0 }}>
                {desktopRightTab === 0 ? historyNode : <OldConclusionsPlaceholder />}
              </Box>
            </Box>
          </>
        )}
      </Box>

      {/* Mobile: details bottom sheet with tabs */}
      {isMobile && (
        <AppBottomSheet
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          header={
            <Tabs value={mobileTab} onChange={(_, v) => setMobileTab(v)} variant="fullWidth" sx={{ flexShrink: 0 }}>
              <Tab label="Карточка" />
              <Tab label="История" />
              <Tab label="Старые зак." />
            </Tabs>
          }
        >
          <Box sx={{ p: 2 }}>
            {mobileTab === 0 && cardNode}
            {mobileTab === 1 && historyNode}
            {mobileTab === 2 && <OldConclusionsPlaceholder />}
          </Box>
        </AppBottomSheet>
      )}

      {/* Add patient drawer (new UX: photo, INN, blacklist) */}
      <DjangoAddPatientDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(p) => {
          setAddOpen(false);
          setPatients((prev) => [p, ...prev]);
          setSelected(p);
        }}
        branchId={defaultBranchId}
      />

      {/* Edit patient drawer */}
      <PatientFormDrawer
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSaved={handleSaved}
        initial={editing}
        branches={branches}
        defaultBranchId={defaultBranchId}
        canCreate={canCreate}
        canUpdate={canUpdate}
      />

      {/* Top-up balance drawer */}
      <BalanceTopUpDrawer
        open={topUpOpen}
        onClose={() => setTopUpOpen(false)}
        patientId={selected?.id ?? null}
        patientFio={selected?.fullName ?? ""}
        branchId={defaultBranchId}
        onSuccess={(b) => setBalance(b)}
      />

      {/* History detail viewer */}
      <Drawer
        anchor="right"
        open={!!historyDetail}
        onClose={() => setHistoryDetail(null)}
        PaperProps={{ sx: { width: { xs: "100%", sm: 520 } } }}
      >
        {historyDetail && (
          <AppointmentDetailsPanel
            appointment={historyDetail}
            canUpdate={false}
            canManageFinance={false}
            canViewFinance={canViewFinance}
            canViewConclusions={false}
            onEdit={() => {}}
            onPay={() => {}}
            onClose={() => setHistoryDetail(null)}
          />
        )}
      </Drawer>

      {/* Merge — not yet available on Django backend */}
      <Dialog open={mergeInfoOpen} onClose={() => setMergeInfoOpen(false)}>
        <DialogTitle>Объединение пациентов</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Объединение дублей пациентов ещё переносится на новый backend и будет
            доступно позже.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMergeInfoOpen(false)} variant="contained">
            Понятно
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DjangoPatientsPage;
