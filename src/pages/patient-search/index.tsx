import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { supabase } from "../../utility/supabaseClient";
import { Box, Grid, Typography, Tabs, Tab, IconButton } from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";

import { AppBottomSheet, PageHeader } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import { usePatientSearchWithCache } from "./usePatientSearchWithCache";
import { usePatientHistory } from "./usePatientHistory";
import { useVisitForm } from "./useVisitForm";
import PatientList from "./components/PatientList";
import PatientHistoryPanel from "./components/PatientHistoryPanel";
import PatientCard from "./components/PatientCard";
import VisitCreateDialog from "./components/VisitCreateDialog";
import { useVisitEditForm } from "./useVisitEditForm";
import AddPatientDrawer from "../../components/patients/AddPatientDrawer";
import EditPatientDrawer from "../../components/patients/EditPatientDrawer";
import { AppointmentDetailsCard } from "../home/components/AppointmentDetailsCard";
import { Drawer } from "@mui/material";
import type { Patient, HistoryRow } from "../../types/models";
import { usePermissions } from "../../hooks/usePermissions";
import { PERMISSIONS } from "../../types/rbac";
import { DoctorConclusionPanel } from "../doctor/components/DoctorConclusionPanel";
import { DoctorWorkDrawer } from "../../components/home/DoctorWorkDrawer";
import { useAppointmentDetails } from "../../hooks/useAppointmentDetails";

import { useOldConclusions } from "./useOldConclusions";
import PatientOldConclusionsPanel from "./components/PatientOldConclusionsPanel";
import OldConclusionDetailsCard from "./components/OldConclusionDetailsCard";
import type { OldConclusion } from "./useOldConclusions";
import { usePatientBalance } from "./usePatientBalance";
import BalanceTopUpDrawer from "./components/BalanceTopUpDrawer";

/**
 * PatientSearchPage
 * Контейнер-страница (Page Component) для поиска и работы с пациентами.
 * Роли:
 *  - собирает данные из кастомных хуков (usePatientList, usePatientHistory, useVisitForm)
 *  - хранит выбор пациента
 *  - отображает презентационные блоки: PatientList (левая колонка), PatientHistoryPanel (середина),
 *    PatientCard (правая колонка), VisitCreateDialog и AddPatientDrawer
 * Принцип: SRP — сложная логика вынесена в хуки, компоненты — "тупые".
 */

// Вспомогательный компонент для загрузки полных данных приема перед открытием Drawer'а редактирования
const DoctorWorkDrawerWrapper: React.FC<{
  appointmentId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ appointmentId, open, onClose, onSuccess }) => {
  const { item, loading } = useAppointmentDetails(open ? appointmentId : null);

  return (
    <DoctorWorkDrawer
      open={open && !loading}
      onClose={onClose}
      appointment={item}
      onSuccess={onSuccess}
    />
  );
};

export const PatientSearchPage: React.FC = () => {
  const { hasPermission, isAdmin, isRegistrator, isDoctor, isNurse } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const [addInitialPhone, setAddInitialPhone] = React.useState("");

  React.useEffect(() => {
    if (searchParams.get("create_patient") === "true") {
      const ph = searchParams.get("phone");
      if (ph) setAddInitialPhone(ph);
      setAddOpen(true);

      // Clear params to avoid reopening on refresh
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("create_patient");
      newParams.delete("phone");
      setSearchParams(newParams);
    }
  }, [searchParams, setSearchParams]);

  // Доступ к созданию/редактированию — для админов, суперадминов и регистраторов
  const canCreatePatient = (isAdmin() || isRegistrator()) && hasPermission(PERMISSIONS.PATIENTS_CREATE);
  const isEmployee = isDoctor() || isNurse(); // Базовые роли медперсонала
  const canSeeWaitList = isAdmin() || isRegistrator() || isEmployee;
  const canUpdatePatient = isAdmin() || isRegistrator();

  const [isDoctorWorkOpen, setIsDoctorWorkOpen] = React.useState(false);

  // Список пациентов с кешированием
  const {
    loading,
    errorMsg,
    patients,
    query,
    setQuery,
    hasMore,
    loadMore,
    reload,
    selectedPatient: selected,
    setSelectedPatient: setSelected,
  } = usePatientSearchWithCache();

  // Vitals state
  const [vitals, setVitals] = useState<{ weight?: number | null, height?: number | null, temperature?: number | null } | null>(null);

  React.useEffect(() => {
    if (!selected) {
      setVitals(null);
      return;
    }

    let active = true;
    (async () => {
      const { data } = await supabase
        .from("Appointments")
        .select("weight, height, temperature")
        .eq("patient_id", selected.id)
        .or("weight.not.is.null,height.not.is.null,temperature.not.is.null")
        .order("appointment_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (active) {
        setVitals(data || null);
      }
    })();
    return () => { active = false; };
  }, [selected]);

  // История приемов выбранного пациента
  const {
    history,
    loading: historyLoading,
    errorMsg: historyError,
    invalidate: invalidateHistoryCache,
    reload: reloadHistory,
  } = usePatientHistory(selected);

  // Старые заключения выбранного пациента
  const {
    data: oldConclusions,
    loading: oldConclusionsLoading,
    errorMsg: oldConclusionsError,
  } = useOldConclusions(selected?.phone);

  // Форма создания приема
  const visit = useVisitForm(selected, {
    onSuccess: () => {
      try {
        invalidateHistoryCache();
      } catch {
        /* noop */
      }
      reloadHistory();
    },
  });

  // Форма редактирования приема
  const visitEdit = useVisitEditForm({
    onSuccess: () => {
      try {
        invalidateHistoryCache();
      } catch {
        /* noop */
      }
      reloadHistory();
    },
  });

  // Счёт пациента
  const {
    balance,
    submitting: balanceSubmitting,
    submitError: balanceSubmitError,
    topUp,
  } = usePatientBalance(selected?.id);

  const [topUpOpen, setTopUpOpen] = React.useState(false);

  // Диалог добавления пациента
  const [addOpen, setAddOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);

  // Просмотр деталей из истории
  const [historyDetailId, setHistoryDetailId] = React.useState<string | null>(null);
  const [isConclusionVisible, setIsConclusionVisible] = React.useState(false);
  const [historyTab, setHistoryTab] = React.useState(0);

  // Просмотр деталей старых заключений
  const [oldConclusionDetail, setOldConclusionDetail] = React.useState<OldConclusion | null>(null);

  // Режимы экрана:
  // - Телефон (< md / < 768px): список на весь экран, BottomSheet с табами
  // - Планшет (md–lg / 768–1199px): 2 колонки — список + карточка/история с табами
  // - Десктоп (>= lg / >= 1200px): 3 колонки — список + карточка + история
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const isTablet = useMediaQuery(theme.breakpoints.between("md", "lg"));
  const isDesktop = useMediaQuery(theme.breakpoints.up("lg"));
  // fullScreen диалогов только на телефонах
  const fullScreen = isMobile;

  // Мобильный BottomSheet с вкладками (только телефон)
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState(0);

  // Таб для планшетного режима (правая колонка: карточка / история)
  const [tabletTab, setTabletTab] = React.useState(0);

  // Таб для десктопной правой колонки (История / Старые заключения)
  const [desktopRightTab, setDesktopRightTab] = React.useState(0);

  const handleSelectPatient = (p: Patient) => {
    setSelected(p);
    setDesktopRightTab(0);
    if (isMobile) {
      setActiveTab(0);
      setMobileOpen(true);
    }
  };

  const tabs = [
    {
      label: "Карточка",
      content: (
        <PatientCard
          patient={selected ? {
            fio: selected.fio,
            phone: selected.phone,
            photo: selected.photo ?? undefined,
            birth_date: selected.birth_date ?? null,
            inn: selected.inn ?? null,
            is_blacklisted: selected.is_blacklisted ?? null,
            blacklist_reason: selected.blacklist_reason ?? null,
          } : null}
          lastDateTime={history[0]?.["Дата и время"]}
          lastService={history[0]?.["Услуга"]}
          lastComplaints={history[0]?.["Жалобы при обращении"]}
          lastWeight={vitals?.weight}
          lastHeight={vitals?.height}
          lastTemperature={vitals?.temperature}
          onEdit={canUpdatePatient ? () => setEditOpen(true) : undefined}
          onTopUp={canUpdatePatient ? () => setTopUpOpen(true) : undefined}
          balance={balance}
        />
      ),
    },
    {
      label: "История",
      content: (
        <PatientHistoryPanel
          selected={!!selected}
          loading={historyLoading}
          errorMsg={historyError}
          history={history}
          onClick={(row) => {
            setHistoryDetailId(row.ID);
            // Если у записи есть диагноз или заключение, сразу активируем возможность переключения табов на мобильных
            if (row.has_conclusion || row.diagnosis_code || row.conclusion) {
              setIsConclusionVisible(true);
            }
          }}
        />
      ),
    },
    {
      label: "Старые заключения",
      content: (
        <PatientOldConclusionsPanel
          selected={!!selected}
          loading={oldConclusionsLoading}
          errorMsg={oldConclusionsError}
          data={oldConclusions}
          onClick={(item) => setOldConclusionDetail(item)}
        />
      ),
    },
  ];

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title="Поиск пациента"
        showTitle={false}
        addButtonText="Добавить пациент"
        onAdd={canCreatePatient ? () => setAddOpen(true) : undefined}
        showSearch
        searchVal={query}
        onSearchChange={setQuery}
        searchPlaceholder="Поиск..."
        loading={loading}
      />

      <Box
        sx={(theme) => ({
          px: theme.appLayout.page.paddingX,
          pb: theme.appLayout.page.paddingY,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          overflow: "hidden"
        })}
      >
        <Grid container spacing={2} sx={{ flex: 1, minHeight: 0 }}>
          {/* Левая колонка: Список пациентов */}
          <Grid
            item
            xs={12}
            md={5}
            lg={3}
            sx={{
              position: { md: "sticky" },
              top: { md: (theme) => theme.spacing(8) },
              alignSelf: { xs: "stretch", md: "flex-start", lg: "stretch" },
              height: {
                xs: "100%",
                md: (theme) => theme.appLayout.viewportOffset.patientSearch.listTabletHeight,
                lg: "100%",
              },
              overflow: "hidden",
            }}
          >
            <Box sx={{ display: "flex", flexDirection: "column", height: 1, minHeight: 0 }}>
              <PatientList
                loading={loading}
                errorMsg={errorMsg}
                patients={patients}
                selectedId={selected?.id ?? null}
                onSelect={handleSelectPatient}
                hasMore={hasMore}
                loadMore={loadMore}
              />
            </Box>
          </Grid>

          {/* ===== Планшет (md–lg): одна правая колонка с табами Карточка / История ===== */}
          {isTablet && (
            <Grid item md={7} sx={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
              {selected ? (
                <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                  <Tabs
                    value={tabletTab}
                    onChange={(_, v) => setTabletTab(v)}
                    variant="fullWidth"
                    sx={{ flexShrink: 0, mb: 1 }}
                  >
                    <Tab label="Карточка" />
                    <Tab label="История" />
                    <Tab label="Старые зак." />
                  </Tabs>
                  <Box sx={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                    {tabletTab === 0 && (
                      <PatientCard
                        patient={{
                          fio: selected.fio,
                          phone: selected.phone,
                          photo: selected.photo ?? undefined,
                          birth_date: selected.birth_date ?? null,
                          inn: selected.inn ?? null,
                          is_blacklisted: selected.is_blacklisted ?? null,
                          blacklist_reason: selected.blacklist_reason ?? null,
                        }}
                        lastDateTime={history[0]?.["Дата и время"]}
                        lastService={history[0]?.["Услуга"]}
                        lastComplaints={history[0]?.["Жалобы при обращении"]}
                        lastWeight={vitals?.weight}
                        lastHeight={vitals?.height}
                        lastTemperature={vitals?.temperature}
                        onEdit={canUpdatePatient ? () => setEditOpen(true) : undefined}
                        onTopUp={canUpdatePatient ? () => setTopUpOpen(true) : undefined}
                        balance={balance}
                      />
                    )}
                    {tabletTab === 1 && (
                      <PatientHistoryPanel
                        selected={!!selected}
                        loading={historyLoading}
                        errorMsg={historyError}
                        history={history}
                        onClick={(row) => setHistoryDetailId(row.ID)}
                      />
                    )}
                    {tabletTab === 2 && (
                      <PatientOldConclusionsPanel
                        selected={!!selected}
                        loading={oldConclusionsLoading}
                        errorMsg={oldConclusionsError}
                        data={oldConclusions}
                        onClick={(item) => setOldConclusionDetail(item)}
                      />
                    )}
                  </Box>
                </Box>
              ) : (
                <Box
                  sx={{
                    px: 2,
                    py: 4,
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Typography color="text.secondary">
                    Выберите пациента слева
                  </Typography>
                </Box>
              )}
            </Grid>
          )}

          {/* ===== Десктоп (>= lg): три колонки — Карточка + История (с табом Старые закл. если есть) ===== */}
          {isDesktop && (
            <>
              <Grid item lg={3.5} sx={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
                {selected ? (
                  <PatientCard
                    patient={{
                      fio: selected.fio,
                      phone: selected.phone,
                      photo: selected.photo ?? undefined,
                      birth_date: selected.birth_date ?? null,
                      inn: selected.inn ?? null,
                      is_blacklisted: selected.is_blacklisted ?? null,
                      blacklist_reason: selected.blacklist_reason ?? null,
                    }}
                    lastDateTime={history[0]?.["Дата и время"]}
                    lastService={history[0]?.["Услуга"]}
                    lastComplaints={history[0]?.["Жалобы при обращении"]}
                    lastWeight={vitals?.weight}
                    lastHeight={vitals?.height}
                    lastTemperature={vitals?.temperature}
                    onEdit={canUpdatePatient ? () => setEditOpen(true) : undefined}
                    onTopUp={canUpdatePatient ? () => setTopUpOpen(true) : undefined}
                    balance={balance}
                  />
                ) : (
                  <Box sx={{ px: 2, py: 4, height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Typography color="text.secondary">Карточка пациента</Typography>
                  </Box>
                )}
              </Grid>

              {/* История + Старые заключения в одной колонке с табами */}
              <Grid item lg={5.5} sx={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
                <Box sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
                  {!oldConclusionsLoading && oldConclusions.length > 0 && (
                    <Tabs
                      value={desktopRightTab}
                      onChange={(_, v) => setDesktopRightTab(v)}
                      sx={{ flexShrink: 0, borderBottom: 1, borderColor: "divider", mb: 1 }}
                    >
                      <Tab label="История приёмов" />
                      <Tab label={`Старые заключения (${oldConclusions.length})`} />
                    </Tabs>
                  )}
                  <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                    {desktopRightTab === 0 ? (
                      <PatientHistoryPanel
                        selected={!!selected}
                        loading={historyLoading}
                        errorMsg={historyError}
                        history={history}
                        onClick={(row) => setHistoryDetailId(row.ID)}
                      />
                    ) : (
                      <PatientOldConclusionsPanel
                        selected={!!selected}
                        loading={oldConclusionsLoading}
                        errorMsg={oldConclusionsError}
                        data={oldConclusions}
                        onClick={(item) => setOldConclusionDetail(item)}
                      />
                    )}
                  </Box>
                </Box>
              </Grid>
            </>
          )}
        </Grid>
      </Box>

      {/* Drawer: Добавить пациента */}
      <AddPatientDrawer
        open={addOpen}
        initialPhone={addInitialPhone}
        onClose={() => {
          setAddOpen(false);
          setAddInitialPhone("");
        }}
        onCreated={(p) => {
          setAddOpen(false);
          reload();
          setSelected({ id: p.id, fio: p.fio, phone: p.phone ?? undefined, photo: p.photo ?? undefined });
        }}
      />

      <EditPatientDrawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        patientId={selected?.id ?? null}
        initialPhoto={selected?.photo ?? null}
        onUpdated={(u) => {
          setSelected({ id: u.id, fio: u.fio, phone: u.phone ?? undefined, photo: u.photo ?? undefined });
          setEditOpen(false);
          reload();
        }}
      />

      {/* Dialog: Создать прием */}
      <VisitCreateDialog
        open={visit.open}
        fullScreen={fullScreen}
        dateTime={visit.dateTime}
        doctor={visit.doctor}
        service={visit.service}
        price={visit.price}
        onChangeDateTime={visit.setDateTime}
        onChangeDoctor={visit.setDoctor}
        onChangeService={visit.setService}
        onChangePrice={visit.setPrice}
        onClose={() => visit.setOpen(false)}
        onSubmit={visit.submit}
        submitting={visit.submitting}
        disabled={!selected}
      />

      {/* Dialog: Редактировать прием */}
      <VisitCreateDialog
        open={visitEdit.open}
        fullScreen={fullScreen}
        mode="edit"
        dateTime={visitEdit.dateTime}
        doctor={visitEdit.doctor}
        service={visitEdit.service}
        price={visitEdit.price}
        onChangeDateTime={visitEdit.setDateTime}
        onChangeDoctor={visitEdit.setDoctor}
        onChangeService={visitEdit.setService}
        onChangePrice={visitEdit.setPrice}
        onClose={() => visitEdit.setOpen(false)}
        onSubmit={visitEdit.submit}
        submitting={visitEdit.submitting}
      />

      {/* Bottom Sheet: Детали пациента на мобильных */}
      <AppBottomSheet
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        header={
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            variant="fullWidth"
            sx={{ flexShrink: 0 }}
          >
            {tabs.map((t) => (
              <Tab key={t.label} label={t.label} />
            ))}
          </Tabs>
        }
      >
        <Box sx={{ p: 2, px: 3 }}>
          {tabs[activeTab].content}
        </Box>
      </AppBottomSheet>

      {/* Drawer: Детали старого заключения */}
      <Drawer
        anchor="right"
        open={!!oldConclusionDetail}
        onClose={() => setOldConclusionDetail(null)}
        PaperProps={{
          sx: { width: { xs: "100%", sm: "100%", md: 500 } },
        }}
      >
        <OldConclusionDetailsCard
          item={oldConclusionDetail}
          patientFio={selected?.fio ?? null}
          patientDob={selected?.birth_date ?? null}
          onClose={() => setOldConclusionDetail(null)}
        />
      </Drawer>

      <Drawer
        anchor="right"
        open={!!historyDetailId}
        onClose={() => {
          setHistoryDetailId(null);
          setIsConclusionVisible(false);
          setHistoryTab(0);
        }}
        PaperProps={{
          sx: {
            width: {
              xs: "100%",
              sm: "100%",
              md: isConclusionVisible && isDesktop ? 1000 : isTablet ? "85%" : 600,
              lg: isConclusionVisible ? 1000 : 600,
            },
            transition: 'width 0.3s'
          },
        }}
      >
        <Box sx={{
          height: "100%",
          display: "flex",
          flexDirection: (isConclusionVisible && isDesktop) ? "row" : "column",
          overflow: "hidden"
        }}>
          {historyDetailId && (() => {
            const currentRow = history.find(r => r.ID === historyDetailId);
            const dataExists = !!(currentRow?.has_conclusion || currentRow?.diagnosis_code || currentRow?.conclusion || currentRow?.diagnosis_data);
            const canSeeAlways = isAdmin() || isRegistrator() || isDoctor() || isNurse();
            const hasConclusionData = dataExists || canSeeAlways;

            const closeDrawer = () => {
              setHistoryDetailId(null);
              setIsConclusionVisible(false);
              setHistoryTab(0);
            };

            return (
              <>
                {/* Шапка с крестиком — всегда видна на мобильном/планшете */}
                {!isDesktop && (
                  <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: hasConclusionData ? 'space-between' : 'flex-end',
                    borderBottom: 1,
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    px: 1,
                    flexShrink: 0,
                  }}>
                    {hasConclusionData && (
                      <Tabs
                        value={historyTab}
                        onChange={(_, v) => setHistoryTab(v)}
                        sx={{ flex: 1 }}
                      >
                        <Tab label="Прием" />
                        <Tab label="Заключение" />
                      </Tabs>
                    )}
                    <IconButton onClick={closeDrawer} size="small" sx={{ ml: 1 }}>
                      <CloseOutlined />
                    </IconButton>
                  </Box>
                )}

                {/* Main Content Area */}
                <Box sx={{
                  flex: 1,
                  display: "flex",
                  flexDirection: (isConclusionVisible && isDesktop) ? "row" : "column",
                  overflow: "hidden"
                }}>
                  {/* Details Section */}
                  {(isDesktop || !hasConclusionData || historyTab === 0) && (
                    <Box sx={{
                      flex: (isConclusionVisible && isDesktop) ? "0 0 450px" : "1 1 auto",
                      height: "100%",
                      overflowY: "auto",
                      borderRight: (isConclusionVisible && isDesktop) ? "1px solid" : "none",
                      borderColor: "divider",
                      display: "flex",
                      flexDirection: "column"
                    }}>
                      <AppointmentDetailsCard
                        appointmentId={historyDetailId}
                        onClose={() => {
                          setHistoryDetailId(null);
                          setIsConclusionVisible(false);
                          setHistoryTab(0);
                        }}
                        hideCloseButton={!isDesktop}
                        hideActionsForDoctor={!canUpdatePatient}
                        isConclusionVisible={isConclusionVisible}
                        onToggleConclusion={() => {
                          const next = !isConclusionVisible;
                          setIsConclusionVisible(next);
                          if (!isDesktop && next) setHistoryTab(1);
                        }}
                        onUpdate={() => {
                          reloadHistory();
                        }}
                      />
                    </Box>
                  )}

                  {/* Conclusion Section */}
                  {(isDesktop ? isConclusionVisible : (hasConclusionData && historyTab === 1)) && (
                    <Box sx={{ flex: 1, height: "100%", overflow: "hidden" }}>
                      <DoctorConclusionPanel
                        appointmentId={historyDetailId}
                        onClose={() => {
                          setIsConclusionVisible(false);
                          setHistoryTab(0);
                        }}
                        hideCloseButton={!isDesktop}
                        onEditClick={() => setIsDoctorWorkOpen(true)}
                        readOnly={false}
                      />
                    </Box>
                  )}
                </Box>
              </>
            );
          })()}
        </Box>
      </Drawer>

      {/* Drawer для редактирования заключения врачом */}
      {historyDetailId && (
        <DoctorWorkDrawerWrapper
          appointmentId={historyDetailId}
          open={isDoctorWorkOpen}
          onClose={() => setIsDoctorWorkOpen(false)}
          onSuccess={() => {
            reloadHistory();
          }}
        />
      )}

      {/* Drawer: Объединить пациентов */}

      {/* Drawer: Пополнить счёт пациента */}
      <BalanceTopUpDrawer
        open={topUpOpen}
        onClose={() => setTopUpOpen(false)}
        patientFio={selected?.fio ?? ""}
        submitting={balanceSubmitting}
        submitError={balanceSubmitError}
        onSubmit={topUp}
      />
    </Box>
  );
};

export default PatientSearchPage;
