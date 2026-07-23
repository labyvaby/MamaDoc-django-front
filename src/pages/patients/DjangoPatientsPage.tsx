import React from "react";
import {
  Box,
  CircularProgress,
  Drawer,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { motion } from "framer-motion";
import ConstructionOutlined from "@mui/icons-material/ConstructionOutlined";
import dayjs from "dayjs";
import "dayjs/locale/ru";

dayjs.locale("ru");

import { PageHeader, AppBottomSheet, SegmentedTabs, cascadeContainer, cascadeItem } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import {
  searchPatients,
} from "../../api/patients";
import type {
  DjangoPatient,
} from "../../api/patients";
import {
  getPatientBalance,
  type PatientBalance,
} from "../../api/patientBalance";
import { getAppointments, type DjangoAppointment } from "../../api/appointments";
import type { RbacBranch } from "../../api/auth";
import { useNotification } from "@refinedev/core";

import PatientListPanel from "./components/PatientListPanel";
import PatientCard from "./components/PatientCard";
import PatientHistoryPanel from "./components/PatientHistoryPanel";
import PatientVaccinationsPanel from "./components/PatientVaccinationsPanel";
import BalanceTopUpDrawer from "./components/BalanceTopUpDrawer";
import AppointmentDetailsPanel from "../appointments/components/AppointmentDetailsPanel";
import DjangoAddPatientDrawer from "../../components/patients/DjangoAddPatientDrawer";
import DjangoEditPatientDrawer from "../../components/patients/DjangoEditPatientDrawer";
import MergePatientDrawer from "../../components/patients/MergePatientDrawer";
import FaceCaptureDrawer from "./components/FaceCaptureDrawer";


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
    <ConstructionOutlined sx={{ fontSize: 36, color: "primary.onSurface", opacity: 0.7 }} />
    <Typography variant="subtitle1" fontWeight={600} align="center">
      Старые заключения в разработке
    </Typography>
    <Typography variant="body2" align="center" sx={{ maxWidth: 320 }}>
      Перенос архивных заключений на новый backend ещё в работе.
    </Typography>
  </Box>
);

// ── Main page ────────────────────────────────────────────────────────────────

const MotionBox = motion(Box);

type RightTabKey = "card" | "history" | "old" | "vaccinations";

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
  const canManagePatients = isSuperAdmin() || hasPermission("patients.manage");
  const canViewFinance = isSuperAdmin() || hasPermission("finance.view");
  const canManageFinance = isSuperAdmin() || hasPermission("finance.manage");
  const canViewVaccinations = isSuperAdmin() || hasPermission("vaccinations.view");

  const branches: RbacBranch[] = activeMembership?.branches ?? [];
  const defaultBranchId = activeBranch?.id ?? null;

  // ── List data ──────────────────────────────────────────────────────────────
  const [patients, setPatients] = React.useState<DjangoPatient[]>([]);
  const [loadingData, setLoadingData] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const loadCtrlRef = React.useRef<AbortController | null>(null);
  const inFlightRef = React.useRef(false);

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
  const [editOpen, setEditOpen] = React.useState(false);
  const [topUpOpen, setTopUpOpen] = React.useState(false);
  const [historyDetail, setHistoryDetail] = React.useState<DjangoAppointment | null>(null);
  const [mergeOpen, setMergeOpen] = React.useState(false);
  const [faceOpen, setFaceOpen] = React.useState(false);

  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [mobileTab, setMobileTab] = React.useState<RightTabKey>("card");
  const [tabletTab, setTabletTab] = React.useState<RightTabKey>("card");
  const [desktopRightTab, setDesktopRightTab] = React.useState<RightTabKey>("history");

  // ── Load list (server-side search + infinite scroll) ─────────────────────────
  // The clinic can have tens of thousands of patients, so we NEVER pull the
  // whole table to the client. The server filters by the search term and pages
  // by offset; the list grows as the user scrolls (PER_PAGE at a time), exactly
  // like the legacy patient-search page.
  const PER_PAGE = 30;
  const fetchChunk = React.useCallback(
    async (offset: number, query: string) => {
      loadCtrlRef.current?.abort();
      const ctrl = new AbortController();
      loadCtrlRef.current = ctrl;
      inFlightRef.current = true;
      setLoadingData(true);
      setError(null);
      try {
        const data = await searchPatients(
          query.trim(),
          PER_PAGE,
          ctrl.signal,
          offset,
        );
        if (ctrl.signal.aborted) return;
        setPatients((prev) => (offset === 0 ? data : [...prev, ...data]));
        setHasMore(data.length === PER_PAGE);
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Ошибка загрузки данных");
      } finally {
        if (!ctrl.signal.aborted) setLoadingData(false);
        inFlightRef.current = false;
      }
    },
    [],
  );

  // Reload from the top whenever the (debounced) search term changes.
  const activeOrgId = activeMembership?.organization?.id;
  const activeBranchId = activeBranch?.id;
  React.useEffect(() => {
    if (permLoading || !canView) return;
    setPatients([]);
    setHasMore(true);
    void fetchChunk(0, debouncedSearch);
    return () => loadCtrlRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permLoading, canView, activeOrgId, activeBranchId, debouncedSearch]);

  // Infinite scroll: append the next page.
  const loadMore = React.useCallback(() => {
    if (loadingData || !hasMore || inFlightRef.current) return;
    void fetchChunk(patients.length, debouncedSearch);
  }, [loadingData, hasMore, patients.length, debouncedSearch, fetchChunk]);

  // Reload from the top (after create/merge/etc).
  const reload = React.useCallback(() => {
    setPatients([]);
    setHasMore(true);
    void fetchChunk(0, debouncedSearch);
  }, [debouncedSearch, fetchChunk]);

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

  // ── List ──────────────────────────────────────────────────────────────────
  // Search + capping now happen server-side in `load`, so the list is used
  // as-is (no client-side filtering over the whole table).
  const filtered = patients;

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
    setDesktopRightTab("history");
    setTabletTab("card");
    if (isMobile) {
      setMobileTab("card");
      setMobileOpen(true);
    }
  };

  const handleAdd = () => setAddOpen(true);
  const handleEdit = () => { if (selected) setEditOpen(true); };

  const handleMerge = () => { if (selected) setMergeOpen(true); };
  const handleFace = () => { if (selected) setFaceOpen(true); };

  const handleMerged = () => {
    setMergeOpen(false);
    setSelected(null);
    reload();
  };

  const handleUpdated = (saved: DjangoPatient) => {
    setEditOpen(false);
    setPatients((prev) => {
      const idx = prev.findIndex((p) => p.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return prev;
    });
    setSelected(saved);
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
      onTopUp={canManageFinance ? () => setTopUpOpen(true) : undefined}
      onMerge={canUpdate ? handleMerge : undefined}
      onFace={canUpdate ? handleFace : undefined}
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

  const vaccinationsNode = (
    <PatientVaccinationsPanel patient={selected} />
  );

  const listNode = (
    <PatientListPanel
      loading={loadingData}
      error={error}
      patients={filtered}
      selectedId={selected?.id ?? null}
      onSelect={handleSelect}
      hasMore={hasMore}
      onLoadMore={loadMore}
    />
  );

  const noSelection = (
    <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed", borderColor: "divider", borderRadius: 1, p: 2, bgcolor: "background.paper" }}>
      <Typography color="text.secondary">Выберите пациента слева</Typography>
    </Box>
  );

  // Полный набор вкладок правой панели (планшет / мобильный: одна колонка на всё).
  const fullTabDefs: { key: RightTabKey; label: string }[] = [
    { key: "card", label: "Карточка" },
    { key: "history", label: "История" },
    { key: "old", label: "Старые зак." },
    ...(canViewVaccinations ? [{ key: "vaccinations" as const, label: "Прививки" }] : []),
  ];

  // Десктоп: карточка уже отдельной колонкой, правая колонка — только история/архив.
  const rightTabDefs: { key: RightTabKey; label: string }[] = [
    { key: "history", label: "История приёмов" },
    { key: "old", label: "Старые заключения" },
    ...(canViewVaccinations ? [{ key: "vaccinations" as const, label: "Прививки" }] : []),
  ];

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

      <MotionBox
        variants={cascadeContainer}
        initial="hidden"
        animate="show"
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
        <MotionBox variants={cascadeItem} sx={{ flex: isMobile ? "1 1 auto" : isTablet ? "5 1 0" : "3 1 0", minWidth: 0, height: "100%" }}>
          {listNode}
        </MotionBox>

        {/* Tablet (md–lg): single right column with tabs Карточка / История / Старые */}
        {isTablet && (
          <MotionBox variants={cascadeItem} sx={{ flex: "7 1 0", minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
            {selected ? (
              <>
                <Box sx={{ flexShrink: 0, mb: 1.5 }}>
                  <SegmentedTabs layoutId="django-patients-tablet-tabs" tabs={fullTabDefs} value={tabletTab} onChange={setTabletTab} />
                </Box>
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  {tabletTab === "card" && cardNode}
                  {tabletTab === "history" && historyNode}
                  {tabletTab === "old" && <OldConclusionsPlaceholder />}
                  {tabletTab === "vaccinations" && canViewVaccinations && vaccinationsNode}
                </Box>
              </>
            ) : (
              noSelection
            )}
          </MotionBox>
        )}

        {/* Desktop (>= lg): three columns — card + (history / old conclusions tabs) */}
        {isDesktop && (
          <>
            <MotionBox variants={cascadeItem} sx={{ flex: "3.5 1 0", minWidth: 0, height: "100%" }}>
              {selected ? cardNode : (
                <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed", borderColor: "divider", borderRadius: 1, bgcolor: "background.paper" }}>
                  <Typography color="text.secondary">Карточка пациента</Typography>
                </Box>
              )}
            </MotionBox>
            <MotionBox variants={cascadeItem} sx={{ flex: "5.5 1 0", minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
              <Box sx={{ flexShrink: 0, mb: 1.5 }}>
                <SegmentedTabs layoutId="django-patients-desktop-right-tabs" tabs={rightTabDefs} value={desktopRightTab} onChange={setDesktopRightTab} />
              </Box>
              <Box sx={{ flex: 1, minHeight: 0 }}>
                {desktopRightTab === "history" && historyNode}
                {desktopRightTab === "old" && <OldConclusionsPlaceholder />}
                {desktopRightTab === "vaccinations" && canViewVaccinations && vaccinationsNode}
              </Box>
            </MotionBox>
          </>
        )}
      </MotionBox>

      {/* Mobile: details bottom sheet with tabs */}
      {isMobile && (
        <AppBottomSheet
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          header={
            <Box sx={{ px: 1.5, py: 1 }}>
              <SegmentedTabs layoutId="django-patients-mobile-tabs" tabs={fullTabDefs} value={mobileTab} onChange={setMobileTab} />
            </Box>
          }
        >
          <Box sx={{ p: 2 }}>
            {mobileTab === "card" && cardNode}
            {mobileTab === "history" && historyNode}
            {mobileTab === "old" && <OldConclusionsPlaceholder />}
            {mobileTab === "vaccinations" && canViewVaccinations && vaccinationsNode}
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
      <DjangoEditPatientDrawer
        open={editOpen}
        patient={selected}
        onClose={() => setEditOpen(false)}
        onUpdated={handleUpdated}
      />

      <FaceCaptureDrawer
        open={faceOpen}
        onClose={() => setFaceOpen(false)}
        patientId={selected?.id ?? null}
        patientName={selected?.fullName ?? ""}
        canForceCapture={canManagePatients}
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

      {/* Объединение дублей пациентов */}
      <MergePatientDrawer
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        initialPatient={selected}
        onMerged={handleMerged}
      />
    </Box>
  );
};

export default DjangoPatientsPage;
