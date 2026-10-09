import React from "react";
import {
  Alert,
  Box,
  ButtonBase,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";
import BiotechOutlined from "@mui/icons-material/BiotechOutlined";
import ChildFriendlyOutlined from "@mui/icons-material/ChildFriendlyOutlined";
import FamilyRestroomOutlined from "@mui/icons-material/FamilyRestroomOutlined";
import HistoryEduOutlined from "@mui/icons-material/HistoryEduOutlined";
import MedicationOutlined from "@mui/icons-material/MedicationOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import EventNoteOutlined from "@mui/icons-material/EventNoteOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import FitnessCenterOutlined from "@mui/icons-material/FitnessCenterOutlined";
import HealthAndSafetyOutlined from "@mui/icons-material/HealthAndSafetyOutlined";
import HealingOutlined from "@mui/icons-material/HealingOutlined";
import MenuBookOutlined from "@mui/icons-material/MenuBookOutlined";
import MonitorHeartOutlined from "@mui/icons-material/MonitorHeartOutlined";
import MoreHorizOutlined from "@mui/icons-material/MoreHorizOutlined";
import PsychologyOutlined from "@mui/icons-material/PsychologyOutlined";
import RemoveRedEyeOutlined from "@mui/icons-material/RemoveRedEyeOutlined";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import StraightenOutlined from "@mui/icons-material/StraightenOutlined";
import HeightOutlined from "@mui/icons-material/HeightOutlined";
import RestaurantOutlined from "@mui/icons-material/RestaurantOutlined";
import VaccinesOutlined from "@mui/icons-material/VaccinesOutlined";
import WorkspacePremiumOutlined from "@mui/icons-material/WorkspacePremiumOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import TuneOutlined from "@mui/icons-material/TuneOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";

import { djangoQueryKeys } from "../../api/queryKeys";
import { getPatient } from "../../api/patients";
import {
  getProgramEnrollments,
  type EffectiveProgramModule,
  type EnrollmentState,
  type ProgramEnrollment,
} from "../../api/programs";
import { AppButton, AppCard, ListEmptyState, UserAvatar } from "../../components/ui";
import { useActiveScope } from "../../hooks/useActiveScope";
import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { subtleBg } from "../../theme/uiHelpers";
import { HealthOverviewCard } from "../../components/health/HealthOverviewCard";
import { HealthSectionCard } from "../../components/health/HealthSectionCard";
import { BookAppointments } from "./BookAppointments";
import { ConnectProgramDialog } from "./ConnectProgramDialog";
import { EnrollmentActionsDrawer } from "./EnrollmentActionsDrawer";
import { InteractionHistory } from "./InteractionHistory";
import { LinkedSection } from "./linkedSections";
import { isLinkedModule, systemType } from "./linkedSectionTypes";
import { ModuleRecords } from "./ModuleRecords";
import { isNeurologyModule } from "./neurology/neuroData";
import { NeurologyModule } from "./neurology/NeurologyModule";
import { isOrthoModule } from "./ortho/orthoData";
import { OrthoModule } from "./ortho/OrthoModule";
import { isVisionModule } from "./vision/visionData";
import { VisionModule } from "./vision/VisionModule";
import { UpcomingEvents } from "./UpcomingEvents";
import { ProgramConstructorDrawer } from "./ProgramConstructorDrawer";

type ViewKey = "overview" | "appointments" | `module:${number}`;

const STATUS_LABELS: Record<EnrollmentState, string> = {
  draft: "Черновик",
  active: "Активна",
  paused: "Приостановлена",
  cancelled: "Отменена",
  expired: "Истекла",
};

function formatDate(value: string | null): string {
  if (!value) return "Без ограничения";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function moduleIcon(module: Pick<EffectiveProgramModule, "code" | "moduleType">) {
  switch (systemType(module)) {
    case "family":
      return <FamilyRestroomOutlined />;
    case "birth_history":
      return <ChildFriendlyOutlined />;
    case "allergies":
      return <WarningAmberOutlined />;
    case "conditions":
      return <MonitorHeartOutlined />;
    case "surgeries":
      return <HealingOutlined />;
    case "medications":
      return <MedicationOutlined />;
    case "visits":
      return <EventNoteOutlined />;
    case "life_anamnesis":
      return <HistoryEduOutlined />;
    case "feeding":
      return <RestaurantOutlined />;
    case "growth":
      // Не как у «Истории болезней»: рост — ростомер.
      return <HeightOutlined />;
    default:
      break;
  }
  const key = `${module.code} ${module.moduleType}`.toLowerCase();
  if (key.includes("vacc")) return <VaccinesOutlined />;
  if (key.includes("eye") || key.includes("ophthalm")) return <RemoveRedEyeOutlined />;
  if (key.includes("bone") || key.includes("ortho")) return <StraightenOutlined />;
  if (key.includes("neuro")) return <PsychologyOutlined />;
  if (key.includes("growth") || key.includes("measure")) return <MonitorHeartOutlined />;
  if (key.includes("lab") || key.includes("analysis")) return <ScienceOutlined />;
  if (key.includes("fitness") || key.includes("training")) return <FitnessCenterOutlined />;
  if (key.includes("medical") || key.includes("doctor")) return <HealthAndSafetyOutlined />;
  return <BiotechOutlined />;
}

function moduleDescription(module: EffectiveProgramModule): string {
  const description = module.settings.description;
  return typeof description === "string" && description.trim()
    ? description
    : "";
}

/**
 * Пункт меню книжки — как пункт бокового меню CRM (`components/sidebar`):
 * те же отступы и подсветка выбранного, без стрелок; длинное название
 * переносится на вторую строку, а не обрезается.
 */
const NavigationItem: React.FC<{
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}> = ({ active, icon, label, onClick }) => (
  <ListItemButton
    selected={active}
    onClick={onClick}
    sx={(theme) => {
      const selected = alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.22 : 0.08);
      const selectedHover = alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.28 : 0.12);
      return {
        flexGrow: 0,
        borderRadius: "10px",
        my: theme.appLayout.sidebar.itemGap,
        py: theme.appLayout.sidebar.itemPaddingY,
        px: 1.4,
        color: active ? theme.palette.primary.onSurface : undefined,
        "& .MuiListItemIcon-root": { minWidth: 36, color: active ? theme.palette.primary.onSurface : undefined },
        "&, &.Mui-selected": { bgcolor: active ? selected : "transparent" },
        "&:hover, &.Mui-selected:hover": { bgcolor: active ? selectedHover : theme.palette.action.hover },
      };
    }}
  >
    <ListItemIcon>{icon}</ListItemIcon>
    <ListItemText primary={label} sx={{ my: 0, "& .MuiListItemText-primary": { overflowWrap: "anywhere" } }} />
  </ListItemButton>
);

/**
 * Строка программы под кнопкой «назад»: название, метки и одна серая строка
 * со сроками. Справа — выбор программы и меню «⋯»; на телефоне они вместе
 * переносятся под название.
 */
const ProgramHeader: React.FC<{
  enrollment: ProgramEnrollment;
  /** Имя пациента — на телефоне, где левого меню с именем нет. */
  patientName?: string;
  select?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ enrollment, patientName, select, actions }) => {
  const meta = [
    patientName ?? "",
    enrollment.branch.name,
    enrollment.startsAt ? `с ${formatDate(enrollment.startsAt)}` : "",
    enrollment.expiresAt ? `до ${formatDate(enrollment.expiresAt)}` : "без срока",
    enrollment.externalId ? `№ ${enrollment.externalId}` : "",
  ].filter(Boolean).join(" · ");
  return (
    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1.5} flexWrap="wrap" sx={{ mb: 1.75 }}>
      <Box sx={{ flex: "1 1 240px", minWidth: 0 }}>
        <Stack direction="row" gap={0.75} alignItems="center" flexWrap="wrap">
          <Typography variant="h6" fontWeight={700}>{enrollment.program.name}</Typography>
          {enrollment.isVip && (
            <Chip size="small" color="warning" icon={<WorkspacePremiumOutlined />} label="VIP" />
          )}
          {/* Действующая программа — без метки; метка только у неактивной. */}
          {(!enrollment.isEffectivelyActive || enrollment.status !== "active") && (
            <Chip size="small" color="default" label={STATUS_LABELS[enrollment.status]} />
          )}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
          {meta}
        </Typography>
      </Box>
      {(select || actions) && (
        <Stack direction="row" gap={1} alignItems="center" sx={{ flexShrink: 0, maxWidth: "100%" }}>
          {select}
          {actions}
        </Stack>
      )}
    </Stack>
  );
};

const PatientProgramPage: React.FC = () => {
  const { patientId: rawPatientId } = useParams();
  const patientId = Number(rawPatientId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scope = useActiveScope();
  const { canAccess } = usePermissions();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [selectedEnrollmentId, setSelectedEnrollmentId] = React.useState<number | null>(null);
  const [view, setView] = React.useState<ViewKey>("overview");
  const [connectOpen, setConnectOpen] = React.useState(false);
  const [actionsOpen, setActionsOpen] = React.useState(false);
  const [constructorOpen, setConstructorOpen] = React.useState(false);
  const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);
  const canManageEnrollments = canAccess("enrollments.manage");
  const canManagePrograms = canAccess("programs.manage");
  const canCreateTask = canAccess("tasks.create");
  const canManageTasks = canAccess("tasks.manage");
  const canNotifyClients = canAccess("notifications.manage");
  const canViewAppointments = canAccess("appointments.view");
  const canViewHealth = canAccess("medical.health.view");

  usePageTitle("Книжка клиента");

  const patientQuery = useQuery({
    queryKey: djangoQueryKeys.patients.detail(patientId),
    queryFn: () => getPatient(patientId),
    enabled: Number.isInteger(patientId) && patientId > 0 && scope.isReady,
  });

  const enrollmentQuery = useQuery({
    queryKey: djangoQueryKeys.programs.enrollments(patientId, scope),
    queryFn: ({ signal }) => getProgramEnrollments(
      scope,
      { patientId, limit: 50 },
      signal,
    ),
    enabled: Number.isInteger(patientId) && patientId > 0 && scope.isReady && scope.orgReady,
  });

  const enrollments = React.useMemo(
    () => enrollmentQuery.data?.results ?? [],
    [enrollmentQuery.data?.results],
  );
  const selectedEnrollment = React.useMemo(() => {
    const selected = enrollments.find((item) => item.id === selectedEnrollmentId);
    return selected ?? enrollments.find((item) => item.isEffectivelyActive) ?? enrollments[0] ?? null;
  }, [enrollments, selectedEnrollmentId]);

  React.useEffect(() => {
    if (selectedEnrollment && selectedEnrollment.id !== selectedEnrollmentId) {
      setSelectedEnrollmentId(selectedEnrollment.id);
      setView("overview");
    }
  }, [selectedEnrollment, selectedEnrollmentId]);

  const loading = patientQuery.isLoading || enrollmentQuery.isLoading || !scope.isReady;
  const error = patientQuery.error || enrollmentQuery.error;
  // Связанный раздел без права просмотра (или с выключенным модулем — canAccess
  // сверяет оба) не показывается вовсе.
  const modules = (selectedEnrollment?.enabledModules ?? []).filter(
    (module) => !isLinkedModule(module) || !module.viewPermission || canAccess(module.viewPermission),
  );
  // «Приёмы» — свой пункт книжки, пока в программе нет раздела `visits`.
  const showAppointmentsItem = canViewAppointments && !modules.some((module) => systemType(module) === "visits");
  const selectedModule = view.startsWith("module:")
    ? modules.find((module) => module.id === Number(view.slice(7))) ?? null
    : null;
  // «Внести замер» из неврологии ведёт в «Рост», если он есть в программе.
  const growthModule = modules.find((module) => systemType(module) === "growth") ?? null;

  if (loading) {
    return (
      <Box sx={{ px: (t) => t.appLayout.page.paddingX, py: 2 }}>
        <Skeleton width={260} height={42} />
        <Skeleton variant="rounded" height={110} sx={{ mt: 2 }} />
        <Skeleton variant="rounded" height={360} sx={{ mt: 2 }} />
      </Box>
    );
  }

  if (error || !patientQuery.data) {
    return (
      <Box sx={{ px: (t) => t.appLayout.page.paddingX, py: 2 }}>
        <Alert severity="error">Не удалось загрузить книжку клиента.</Alert>
      </Box>
    );
  }

  const patient = patientQuery.data;
  // Редкие действия с программой — в меню «⋯», права те же, что у прежних кнопок.
  const canOpenEnrollmentActions = canManageEnrollments && !!selectedEnrollment
    && !["cancelled", "expired"].includes(selectedEnrollment.status);
  const canConnectAnother = canManageEnrollments && !!selectedEnrollment;
  const programMenu = canOpenEnrollmentActions || canConnectAnother || canManagePrograms ? (
    <>
      <Tooltip title="Управление программой">
        <IconButton
          aria-label="Управление программой"
          onClick={(event) => setMenuAnchor(event.currentTarget)}
          sx={{ border: 1, borderColor: "divider", borderRadius: "10px" }}
        >
          <MoreHorizOutlined />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        {canOpenEnrollmentActions && (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              setActionsOpen(true);
            }}
          >
            <SettingsOutlined fontSize="small" sx={{ mr: 1.25, color: "text.secondary" }} />
            Управление подключением
          </MenuItem>
        )}
        {canConnectAnother && (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              setConnectOpen(true);
            }}
          >
            <AddOutlined fontSize="small" sx={{ mr: 1.25, color: "text.secondary" }} />
            Подключить другую программу
          </MenuItem>
        )}
        {canManagePrograms && (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              setConstructorOpen(true);
            }}
          >
            <TuneOutlined fontSize="small" sx={{ mr: 1.25, color: "text.secondary" }} />
            Конструктор программы
          </MenuItem>
        )}
      </Menu>
    </>
  ) : null;

  return (
    <Box
      sx={{
        px: (t) => t.appLayout.page.paddingX,
        pb: 2,
        height: "100%",
        minHeight: 0,
        overflowY: "auto",
        overflowX: "hidden",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {/* «Книжка клиента» уже в шапке приложения — здесь только «назад». */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1.5} sx={{ mb: 1 }}>
        <AppButton
          variant="text"
          size="small"
          startIcon={<ArrowBackOutlined />}
          onClick={() => navigate("/patients")}
          sx={{ ml: -1 }}
        >
          К списку пациентов
        </AppButton>
        {/* Без программы строки с названием нет — меню стоит здесь. */}
        {!selectedEnrollment && programMenu}
      </Stack>

      {!selectedEnrollment ? (
        <AppCard variant="outlined" sx={{ minHeight: 360, display: "grid", placeItems: "center" }}>
          <ListEmptyState
            icon={<MenuBookOutlined />}
            title="Программа не подключена"
            description="У клиента пока нет доступных программ обслуживания."
            action={canManageEnrollments ? (
              <AppButton variant="contained" startIcon={<AddOutlined />} onClick={() => setConnectOpen(true)}>
                Подключить программу
              </AppButton>
            ) : undefined}
          />
        </AppCard>
      ) : (
        <Box>
          <ProgramHeader
            enrollment={selectedEnrollment}
            patientName={isMobile ? patient.fullName : undefined}
            select={enrollments.length > 1 ? (
              <FormControl size="small" sx={{ minWidth: { xs: 160, sm: 240 } }}>
                <Select
                  value={selectedEnrollment.id}
                  onChange={(event) => {
                    setSelectedEnrollmentId(Number(event.target.value));
                    setView("overview");
                  }}
                >
                  {enrollments.map((enrollment) => (
                    <MenuItem key={enrollment.id} value={enrollment.id}>
                      {enrollment.program.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : undefined}
            actions={programMenu}
          />
          {!selectedEnrollment.isEffectivelyActive && (
            <Alert severity="warning" sx={{ mb: 1.75 }}>
              Подключение сейчас неактивно. Разделы временно недоступны, но история программы сохранена.
            </Alert>
          )}

          {/* На «Обзоре» телефона навигация — плитки разделов, ряд чипов не повторяем. */}
          {isMobile && (view !== "overview" || modules.length === 0) && (
            <Stack direction="row" gap={0.75} sx={{ mb: 1.5, overflowX: "auto", pb: 0.25 }}>
              <Chip
                clickable
                color={view === "overview" ? "primary" : "default"}
                label="Обзор"
                onClick={() => setView("overview")}
              />
              {showAppointmentsItem && (
                <Chip
                  clickable
                  color={view === "appointments" ? "primary" : "default"}
                  label="Приёмы"
                  onClick={() => setView("appointments")}
                />
              )}
              {modules.map((module) => (
                <Chip
                  key={module.id}
                  clickable
                  color={view === `module:${module.id}` ? "primary" : "default"}
                  label={module.name}
                  onClick={() => setView(`module:${module.id}`)}
                />
              ))}
            </Stack>
          )}

          <Box
            sx={{
              display: "grid",
              // Колонка меню — ширины бокового меню CRM, названия разделов не обрезаются.
              gridTemplateColumns: { xs: "1fr", md: `${theme.appLayout.sidebar.width.desktopExpanded}px minmax(0, 1fr)` },
              gap: 1.75,
              alignItems: "start",
            }}
          >
            {!isMobile && (
              <AppCard
                variant="outlined"
                // Поля как у бокового меню CRM: пункты почти от края, названия помещаются.
                sx={{ position: "sticky", top: 12, "& .MuiCardContent-root": { px: 1, py: 1.5 } }}
              >
                <Stack direction="row" alignItems="center" gap={1.25} sx={{ mb: 1.5, px: 1 }}>
                  <UserAvatar src={patient.photoUrl} name={patient.fullName} size={42} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: "anywhere" }}>
                      {patient.fullName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{patient.phone || "Телефон не указан"}</Typography>
                  </Box>
                </Stack>
                <Divider sx={{ mb: 1 }} />
                <Stack>
                  <NavigationItem
                    active={view === "overview"}
                    icon={<AutoAwesomeOutlined />}
                    label="Обзор"
                    onClick={() => setView("overview")}
                  />
                  {showAppointmentsItem && (
                    <NavigationItem
                      active={view === "appointments"}
                      icon={<EventNoteOutlined />}
                      label="Приёмы"
                      onClick={() => setView("appointments")}
                    />
                  )}
                  {modules.map((module) => (
                    <NavigationItem
                      key={module.id}
                      active={view === `module:${module.id}`}
                      icon={moduleIcon(module)}
                      label={module.name}
                      onClick={() => setView(`module:${module.id}`)}
                    />
                  ))}
                </Stack>
              </AppCard>
            )}

            <Box sx={{ minWidth: 0 }}>
              {view === "overview" && (
                <Stack gap={1.75}>
                  {/* На компьютере разделы уже в левом меню — плитки только на телефоне. */}
                  {(isMobile || modules.length === 0) && (
                  <HealthSectionCard title="Разделы программы">
                  {modules.length === 0 ? (
                    <ListEmptyState
                      icon={<HealthAndSafetyOutlined />}
                      title="Нет доступных разделов"
                      description="Разделы программы отключены или ещё не настроены для этого филиала."
                    />
                  ) : (
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" },
                        gap: 1.25,
                      }}
                    >
                      {[
                        // Ряда чипов на «Обзоре» нет — «Приёмы» тоже плиткой, чтобы до них дойти.
                        ...(showAppointmentsItem
                          ? [{ key: "appointments", view: "appointments" as ViewKey, icon: <EventNoteOutlined />, name: "Приёмы", description: "" }]
                          : []),
                        ...modules.map((module) => ({
                          key: `module:${module.id}`,
                          view: `module:${module.id}` as ViewKey,
                          icon: moduleIcon(module),
                          name: module.name,
                          description: moduleDescription(module),
                        })),
                      ].map((tile) => (
                        <ButtonBase
                          key={tile.key}
                          onClick={() => setView(tile.view)}
                          sx={(theme) => ({
                            justifyContent: "flex-start",
                            gap: 1.25,
                            p: 1.5,
                            border: 1,
                            borderColor: "divider",
                            borderRadius: 1.5,
                            bgcolor: subtleBg(theme),
                            textAlign: "left",
                            "&:hover": { borderColor: "primary.main", bgcolor: subtleBg(theme, true) },
                          })}
                        >
                          <Box sx={{ color: "primary.main", display: "flex", "& .MuiSvgIcon-root": { fontSize: 24 } }}>
                            {tile.icon}
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={700} noWrap>{tile.name}</Typography>
                            {tile.description && (
                              <Typography variant="caption" color="text.secondary" noWrap display="block">
                                {tile.description}
                              </Typography>
                            )}
                          </Box>
                          <ChevronRightOutlined color="action" fontSize="small" />
                        </ButtonBase>
                      ))}
                    </Box>
                  )}
                  </HealthSectionCard>
                  )}
                  <HealthOverviewCard
                    patientId={patient.id}
                    enrollmentId={selectedEnrollment.id}
                    // Чек-лист — у ребёнка на учёте (есть оплачиваемые периоды), пока осмотр не закрыт.
                    onboardingOpen={!selectedEnrollment.onboardingCompletedAt && selectedEnrollment.terms.length > 0}
                  />
                  <UpcomingEvents
                    enrollmentId={selectedEnrollment.id}
                    patientName={patient.fullName}
                    scope={scope}
                    canNotify={canNotifyClients}
                  />
                  <InteractionHistory
                    enrollmentId={selectedEnrollment.id}
                    patientName={patient.fullName}
                    patientPhone={patient.phone}
                    scope={scope}
                    canManage={canManageEnrollments}
                    canCreateTask={canCreateTask}
                    canManageTasks={canManageTasks}
                  />
                </Stack>
              )}

              {view === "appointments" && showAppointmentsItem && (
                <BookAppointments patientId={patient.id} birthDate={patient.birthDate ?? null} scope={scope} />
              )}

              {selectedModule && (isLinkedModule(selectedModule) ? (
                <LinkedSection
                  module={selectedModule}
                  patient={patient}
                  enrollmentId={selectedEnrollment.id}
                  scope={scope}
                  icon={moduleIcon(selectedModule)}
                  hasSection={(type) => modules.some((module) => systemType(module) === type)}
                  openSection={(type) => {
                    const target = modules.find((module) => systemType(module) === type);
                    if (target) setView(`module:${target.id}`);
                  }}
                />
              ) : isVisionModule(selectedModule) ? (
                <VisionModule
                  enrollmentId={selectedEnrollment.id}
                  module={selectedModule}
                  scope={scope}
                  canManage={canManageEnrollments && selectedEnrollment.isEffectivelyActive}
                  icon={moduleIcon(selectedModule)}
                  birthDate={patient.birthDate ?? null}
                />
              ) : isNeurologyModule(selectedModule) ? (
                <NeurologyModule
                  enrollmentId={selectedEnrollment.id}
                  module={selectedModule}
                  scope={scope}
                  canManage={canManageEnrollments && selectedEnrollment.isEffectivelyActive}
                  icon={moduleIcon(selectedModule)}
                  birthDate={patient.birthDate ?? null}
                  patientId={patient.id}
                  gender={patient.gender ?? null}
                  canViewHealth={canViewHealth}
                  onOpenGrowth={growthModule ? () => setView(`module:${growthModule.id}`) : undefined}
                />
              ) : isOrthoModule(selectedModule) ? (
                <OrthoModule
                  enrollmentId={selectedEnrollment.id}
                  module={selectedModule}
                  scope={scope}
                  canManage={canManageEnrollments && selectedEnrollment.isEffectivelyActive}
                  icon={moduleIcon(selectedModule)}
                  birthDate={patient.birthDate ?? null}
                />
              ) : (
                <ModuleRecords
                  enrollmentId={selectedEnrollment.id}
                  module={selectedModule}
                  scope={scope}
                  canManage={canManageEnrollments && selectedEnrollment.isEffectivelyActive}
                  icon={moduleIcon(selectedModule)}
                />
              ))}
            </Box>
          </Box>
        </Box>
      )}

      {enrollmentQuery.isFetching && !enrollmentQuery.isLoading && (
        <CircularProgress size={20} sx={{ position: "fixed", right: 24, bottom: 24 }} />
      )}

      <ConnectProgramDialog
        open={connectOpen}
        patientId={patient.id}
        patientName={patient.fullName}
        scope={scope}
        connectedProgramIds={enrollments
          .filter((item) => item.status !== "cancelled" && item.status !== "expired")
          .map((item) => item.program.id)}
        onClose={() => setConnectOpen(false)}
        onConnected={(enrollment) => {
          setSelectedEnrollmentId(enrollment.id);
          setView("overview");
          void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.programs.enrollments(patientId, scope) });
          void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.patients.detail(patientId) });
        }}
      />
      {selectedEnrollment && canManageEnrollments && (
        <EnrollmentActionsDrawer
          open={actionsOpen}
          enrollment={selectedEnrollment}
          scope={scope}
          onClose={() => setActionsOpen(false)}
          onUpdated={() => {
            setActionsOpen(false);
            setView("overview");
            void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.programs.enrollments(patientId, scope) });
            void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.patients.detail(patientId) });
          }}
        />
      )}
      {canManagePrograms && (
        <ProgramConstructorDrawer
          open={constructorOpen}
          programId={selectedEnrollment?.program.id ?? null}
          scope={scope}
          onClose={() => setConstructorOpen(false)}
          onChanged={() => {
            void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.programs.all });
            void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.programs.enrollments(patientId, scope) });
          }}
        />
      )}
    </Box>
  );
};

export default PatientProgramPage;
