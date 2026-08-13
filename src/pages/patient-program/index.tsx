import React from "react";
import {
  Alert,
  Box,
  ButtonBase,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";
import BiotechOutlined from "@mui/icons-material/BiotechOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import FitnessCenterOutlined from "@mui/icons-material/FitnessCenterOutlined";
import HealthAndSafetyOutlined from "@mui/icons-material/HealthAndSafetyOutlined";
import MenuBookOutlined from "@mui/icons-material/MenuBookOutlined";
import MonitorHeartOutlined from "@mui/icons-material/MonitorHeartOutlined";
import RemoveRedEyeOutlined from "@mui/icons-material/RemoveRedEyeOutlined";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import StraightenOutlined from "@mui/icons-material/StraightenOutlined";
import VaccinesOutlined from "@mui/icons-material/VaccinesOutlined";
import WorkspacePremiumOutlined from "@mui/icons-material/WorkspacePremiumOutlined";
import { useQuery } from "@tanstack/react-query";
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
import { subtleBg } from "../../theme/uiHelpers";

type ViewKey = "overview" | `module:${number}`;

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
  const key = `${module.code} ${module.moduleType}`.toLowerCase();
  if (key.includes("vacc")) return <VaccinesOutlined />;
  if (key.includes("eye") || key.includes("ophthalm")) return <RemoveRedEyeOutlined />;
  if (key.includes("bone") || key.includes("ortho")) return <StraightenOutlined />;
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
    : "Раздел подключён к программе";
}

const NavigationItem: React.FC<{
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}> = ({ active, icon, label, onClick }) => (
  <ButtonBase
    onClick={onClick}
    sx={(theme) => ({
      width: "100%",
      minHeight: 42,
      justifyContent: "flex-start",
      gap: 1.25,
      px: 1.25,
      borderRadius: 1.5,
      color: active ? "primary.main" : "text.secondary",
      bgcolor: active ? subtleBg(theme, true) : "transparent",
      fontWeight: active ? 700 : 500,
      textAlign: "left",
      "&:hover": { bgcolor: subtleBg(theme, true) },
      "& .MuiSvgIcon-root": { fontSize: 19 },
    })}
  >
    {icon}
    <Typography variant="body2" fontWeight="inherit" noWrap sx={{ flex: 1 }}>
      {label}
    </Typography>
    <ChevronRightOutlined sx={{ opacity: active ? 1 : 0.45 }} />
  </ButtonBase>
);

const ProgramHeader: React.FC<{ enrollment: ProgramEnrollment }> = ({ enrollment }) => (
  <AppCard variant="outlined" sx={{ mb: 1.75 }}>
    <Stack direction={{ xs: "column", sm: "row" }} gap={1.5} alignItems={{ sm: "center" }}>
      <Box
        sx={(theme) => ({
          width: 44,
          height: 44,
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          borderRadius: 1.5,
          color: "primary.main",
          bgcolor: subtleBg(theme, true),
        })}
      >
        <MenuBookOutlined />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" gap={0.75} alignItems="center" flexWrap="wrap">
          <Typography variant="h6" fontWeight={700}>{enrollment.program.name}</Typography>
          {enrollment.isVip && (
            <Chip size="small" color="warning" icon={<WorkspacePremiumOutlined />} label="VIP" />
          )}
          <Chip
            size="small"
            color={enrollment.isEffectivelyActive ? "success" : "default"}
            label={STATUS_LABELS[enrollment.status]}
          />
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
          {enrollment.branch.name} · действует до {formatDate(enrollment.expiresAt)}
        </Typography>
      </Box>
      <Stack direction="row" alignItems="center" gap={1}>
        <Typography variant="caption" color="text.secondary">
          {enrollment.enabledModules.length} разделов
        </Typography>
      </Stack>
    </Stack>
  </AppCard>
);

const PatientProgramPage: React.FC = () => {
  const { patientId: rawPatientId } = useParams();
  const patientId = Number(rawPatientId);
  const navigate = useNavigate();
  const scope = useActiveScope();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [selectedEnrollmentId, setSelectedEnrollmentId] = React.useState<number | null>(null);
  const [view, setView] = React.useState<ViewKey>("overview");

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
  const modules = selectedEnrollment?.enabledModules ?? [];
  const selectedModule = view.startsWith("module:")
    ? modules.find((module) => module.id === Number(view.slice(7))) ?? null
    : null;

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

  return (
    <Box sx={{ px: (t) => t.appLayout.page.paddingX, pb: 2, minHeight: "100%" }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ sm: "flex-start" }}
        gap={1.5}
        sx={{ mb: 1.75 }}
      >
        <Box>
          <AppButton
            variant="text"
            size="small"
            startIcon={<ArrowBackOutlined />}
            onClick={() => navigate("/patients")}
            sx={{ ml: -1, mb: 0.25 }}
          >
            К списку пациентов
          </AppButton>
          <Typography variant="h5" fontWeight={700}>Книжка клиента</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
            Программы обслуживания и подключённые разделы
          </Typography>
        </Box>
        {enrollments.length > 1 && selectedEnrollment && (
          <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 260 } }}>
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
        )}
      </Stack>

      {!selectedEnrollment ? (
        <AppCard variant="outlined" sx={{ minHeight: 360, display: "grid", placeItems: "center" }}>
          <ListEmptyState
            icon={<MenuBookOutlined />}
            title="Программа не подключена"
            description="У клиента пока нет доступных программ обслуживания."
          />
        </AppCard>
      ) : (
        <Box>
          <ProgramHeader enrollment={selectedEnrollment} />
          {!selectedEnrollment.isEffectivelyActive && (
            <Alert severity="warning" sx={{ mb: 1.75 }}>
              Подключение сейчас неактивно. Разделы временно недоступны, но история программы сохранена.
            </Alert>
          )}

          {isMobile && (
            <Stack direction="row" gap={0.75} sx={{ mb: 1.5, overflowX: "auto", pb: 0.25 }}>
              <Chip
                clickable
                color={view === "overview" ? "primary" : "default"}
                label="Обзор"
                onClick={() => setView("overview")}
              />
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
              gridTemplateColumns: { xs: "1fr", md: "230px minmax(0, 1fr)" },
              gap: 1.75,
              alignItems: "start",
            }}
          >
            {!isMobile && (
              <AppCard variant="outlined" sx={{ position: "sticky", top: 12 }}>
                <Stack direction="row" alignItems="center" gap={1.25} sx={{ mb: 1.5 }}>
                  <UserAvatar src={patient.photoUrl} name={patient.fullName} size={42} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={700} noWrap>{patient.fullName}</Typography>
                    <Typography variant="caption" color="text.secondary">{patient.phone || "Телефон не указан"}</Typography>
                  </Box>
                </Stack>
                <Divider sx={{ mb: 1 }} />
                <Stack gap={0.5}>
                  <NavigationItem
                    active={view === "overview"}
                    icon={<AutoAwesomeOutlined />}
                    label="Обзор"
                    onClick={() => setView("overview")}
                  />
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
                <AppCard
                  variant="outlined"
                  title="Разделы программы"
                  subheader="Состав определяется настройками организации, филиала и подключения клиента"
                >
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
                      {modules.map((module) => (
                        <ButtonBase
                          key={module.id}
                          onClick={() => setView(`module:${module.id}`)}
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
                            {moduleIcon(module)}
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={700} noWrap>{module.name}</Typography>
                            <Typography variant="caption" color="text.secondary" noWrap display="block">
                              {moduleDescription(module)}
                            </Typography>
                          </Box>
                          <ChevronRightOutlined color="action" fontSize="small" />
                        </ButtonBase>
                      ))}
                    </Box>
                  )}

                  <Divider sx={{ my: 2 }} />
                  <Stack direction={{ xs: "column", sm: "row" }} gap={2.5}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Начало программы</Typography>
                      <Stack direction="row" alignItems="center" gap={0.75} sx={{ mt: 0.4 }}>
                        <CalendarMonthOutlined fontSize="small" color="primary" />
                        <Typography variant="body2" fontWeight={600}>{formatDate(selectedEnrollment.startsAt)}</Typography>
                      </Stack>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Идентификатор</Typography>
                      <Typography variant="body2" fontWeight={600} sx={{ mt: 0.4 }}>
                        {selectedEnrollment.externalId || `#${selectedEnrollment.id}`}
                      </Typography>
                    </Box>
                  </Stack>
                </AppCard>
              )}

              {selectedModule && (
                <AppCard
                  variant="outlined"
                  header={
                    <Stack direction="row" alignItems="center" gap={1.25} sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
                      <Box sx={{ color: "primary.main", display: "flex" }}>{moduleIcon(selectedModule)}</Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="h6" fontWeight={700}>{selectedModule.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{selectedModule.moduleType}</Typography>
                      </Box>
                      <Chip size="small" color="success" label="Подключён" />
                    </Stack>
                  }
                >
                  <Box
                    sx={(theme) => ({
                      minHeight: 240,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      p: 3,
                      borderRadius: 1.5,
                      bgcolor: subtleBg(theme),
                    })}
                  >
                    <Box sx={{ color: "primary.main", mb: 1.5, "& .MuiSvgIcon-root": { fontSize: 38 } }}>
                      {moduleIcon(selectedModule)}
                    </Box>
                    <Typography variant="subtitle1" fontWeight={700}>{moduleDescription(selectedModule)}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, maxWidth: 520 }}>
                      Раздел уже управляется конструктором программы. Формы записей и профильные медицинские данные будут подключаться отдельными этапами без изменения этой страницы.
                    </Typography>
                  </Box>
                </AppCard>
              )}
            </Box>
          </Box>
        </Box>
      )}

      {enrollmentQuery.isFetching && !enrollmentQuery.isLoading && (
        <CircularProgress size={20} sx={{ position: "fixed", right: 24, bottom: 24 }} />
      )}
    </Box>
  );
};

export default PatientProgramPage;
