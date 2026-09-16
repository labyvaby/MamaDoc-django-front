import React from "react";
import {
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditOutlined from "@mui/icons-material/EditOutlined";
import FolderSharedOutlinedIcon from "@mui/icons-material/FolderSharedOutlined";
import LocalPhoneOutlinedIcon from "@mui/icons-material/LocalPhoneOutlined";
import CakeOutlinedIcon from "@mui/icons-material/CakeOutlined";
import WcOutlinedIcon from "@mui/icons-material/WcOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import MedicalServicesOutlinedIcon from "@mui/icons-material/MedicalServicesOutlined";
import dayjs from "dayjs";
import { formatPatientAge } from "../../utility/age";
import "dayjs/locale/ru";

import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { getPatient, type DjangoPatient } from "../../api/patients";
import { ApiError } from "../../api/client";
import { djangoQueryKeys } from "../../api/queryKeys";
import { useCan } from "../../hooks/useCan";
import DjangoEditPatientDrawer from "./DjangoEditPatientDrawer";
import { getAppointments, type DjangoAppointment } from "../../api/appointments";
import { orgWide } from "../../api/scope";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import AppointmentStatusChips from "../appointments/AppointmentStatusChips";
import { useT } from "../../i18n/VerticalProvider";
import { tt } from "../../i18n/t";

dayjs.locale("ru");

/**
 * Что о пациенте уже знает вызывающий экран (объект `patient` приёма).
 * Карта по `/patients/<id>/` иногда не отдаётся (404/500/обрыв), хотя пациент
 * есть — раньше дровер в таком случае писал «не найден» и всё. Теперь
 * показываем эти данные и историю посещений, а причину — в примечании.
 */
export type PatientQuickViewFallback = {
  fullName: string;
  phone?: string | null;
  photoUrl?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  patientId: number | null;
  fallback?: PatientQuickViewFallback | null;
};

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}



function doctorsLabel(appt: DjangoAppointment): string {
  const names = Array.from(
    new Set(appt.services.filter((s) => s.employee).map((s) => s.employee!.fullName)),
  );
  if (names.length === 0) return "—";
  if (names.length === 1) return names[0];
  return tt("common:counts.performers", { count: names.length });
}

function servicesLabel(appt: DjangoAppointment): string {
  if (appt.services.length === 0) return "—";
  if (appt.services.length === 1) return appt.services[0].service?.name ?? "—";
  return tt("common:counts.services", { count: appt.services.length });
}

/** Сколько посещений показываем до нажатия «Показать все». */
const COLLAPSED_LIMIT = 5;

const DjangoPatientQuickViewDrawer: React.FC<Props> = ({
  open,
  onClose,
  patientId,
  fallback,
}) => {
  const { t } = useT("patients");
  const [loading, setLoading] = React.useState(false);
  const [patient, setPatient] = React.useState<DjangoPatient | null>(null);
  /** Почему карта не загрузилась — показываем в примечании, чтобы «иногда
   *  не найден» перестало быть загадкой: статус и сообщение бэка. */
  const [loadError, setLoadError] = React.useState<string | null>(null);
  // Вся история посещений, а не только последние: чтобы смотреть её не нужно
  // было уходить в «Все пациенты» и искать карту там.
  const [visits, setVisits] = React.useState<DjangoAppointment[]>([]);
  const [visitsLoading, setVisitsLoading] = React.useState(false);
  const [visitsExpanded, setVisitsExpanded] = React.useState(false);
  const orgId = useApiOrgId();
  const canUpdate = useCan("patients.update");
  const canViewPatients = useCan("patients.view");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = React.useState(false);

  /**
   * Карта правится прямо из краткого просмотра, поэтому обновлённого пациента
   * кладём и в локальный state (дровер перерисуется сразу), и в кэш react-query:
   * ФИО с телефоном приходят внутри объекта приёма, а его держит уже react-query.
   */
  const handleUpdated = React.useCallback(
    (p: DjangoPatient) => {
      setPatient(p);
      setEditOpen(false);
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.patients.detail(p.id) });
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.appointments.all });
    },
    [queryClient],
  );

  /** Полная карта пациента — заключения, вакцины, архив: туда за деталями. */
  const openCard = React.useCallback(
    (id: number) => {
      onClose();
      navigate(`/patients?patient=${id}`);
    },
    [navigate, onClose],
  );

  /** Открыть другой приём пациента — тем же дровером, что и из регистратуры. */
  const openVisit = React.useCallback(
    (appointmentId: number) => {
      onClose();
      navigate(`/appointments?appointment=${appointmentId}`);
    },
    [navigate, onClose],
  );

  React.useEffect(() => {
    if (!patientId || !open) {
      setPatient(null);
      setLoadError(null);
      setVisits([]);
      setVisitsExpanded(false);
      return;
    }
    let active = true;
    setLoading(true);
    setLoadError(null);
    getPatient(patientId)
      .then((p) => {
        if (active) setPatient(p);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setPatient(null);
        setLoadError(
          e instanceof ApiError
            ? `${e.status}${e.code ? ` ${e.code}` : ""}: ${e.message}`
            : e instanceof Error
              ? e.message
              : String(e),
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    setVisitsLoading(true);
    setVisitsExpanded(false);
    getAppointments(orgWide(orgId), { patientId })
      .then((rows) => {
        if (!active) return;
        const sorted = [...rows].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
        setVisits(sorted);
      })
      .catch(() => {
        if (active) setVisits([]);
      })
      .finally(() => {
        if (active) setVisitsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [patientId, open, orgId]);

  /** Шапка дровера: карта, а если она не загрузилась — данные из записи. */
  const head: PatientQuickViewFallback | null = patient ?? fallback ?? null;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: 320, sm: 480, md: 520 },
          maxWidth: "100vw",
          display: "flex",
          flexDirection: "column",
          overscrollBehavior: "contain",
        },
      }}
    >
      <Box
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <Typography variant="h6" fontWeight={600}>
          {t("quickView.title")}
        </Typography>
        <Stack direction="row" spacing={0.5} alignItems="center">
          {canViewPatients && patient && (
            <Tooltip title={t("quickView.openCard")}>
              <IconButton onClick={() => openCard(patient.id)} size="small">
                <FolderSharedOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {canUpdate && patient && (
            <Tooltip title={t("quickView.edit")}>
              <IconButton onClick={() => setEditOpen(true)} size="small">
                <EditOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>
      </Box>

      <Box
        sx={{
          p: 2,
          overflowY: "auto",
          flex: 1,
          minHeight: 0,
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        {loading ? (
          <Stack spacing={2}>
            <Skeleton variant="rectangular" height={64} />
            <Skeleton variant="text" width="60%" />
            <Skeleton variant="text" width="80%" />
          </Stack>
        ) : head ? (
          <Stack spacing={2.5}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Avatar
                src={head.photoUrl ?? undefined}
                sx={{ width: 56, height: 56, bgcolor: "primary.main", fontWeight: 700 }}
              >
                {initials(head.fullName)}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" fontWeight={600} noWrap>
                  {head.fullName}
                </Typography>
                <Chip
                  label={t("quickView.chip")}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ mt: 0.5 }}
                />
              </Box>
            </Stack>

            <Divider />

            {!patient && (
              /* Карта не загрузилась — телефон из записи и причина. История
                 ниже грузится отдельным запросом и от карты не зависит. */
              <Stack spacing={1.5}>
                {head.phone && (
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <LocalPhoneOutlinedIcon fontSize="small" color="action" />
                    <Typography variant="body2" color="text.secondary">
                      {t("quickView.phone")}
                    </Typography>
                    <Typography
                      variant="body2"
                      fontWeight={500}
                      component="a"
                      href={`tel:${head.phone}`}
                      sx={{ textDecoration: "none", color: "primary.main" }}
                    >
                      {head.phone}
                    </Typography>
                  </Stack>
                )}
                <Box
                  sx={{
                    p: 1.5,
                    border: 1,
                    borderColor: "divider",
                    borderRadius: "10px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 1.25,
                  }}
                >
                  <InfoOutlinedIcon fontSize="small" color="action" sx={{ mt: 0.125 }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {t("quickView.cardUnavailable")}
                    </Typography>
                    {loadError && (
                      <Typography
                        variant="caption"
                        color="text.disabled"
                        display="block"
                        sx={{ wordBreak: "break-word" }}
                      >
                        {loadError}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Stack>
            )}

            {patient && (
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <LocalPhoneOutlinedIcon fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">
                  {t("quickView.phone")}
                </Typography>
                {patient.phone ? (
                  <Typography
                    variant="body2"
                    fontWeight={500}
                    component="a"
                    href={`tel:${patient.phone}`}
                    sx={{ textDecoration: "none", color: "primary.main" }}
                  >
                    {patient.phone}
                  </Typography>
                ) : (
                  <Typography variant="body2" fontWeight={500}>
                    —
                  </Typography>
                )}
              </Stack>

              {patient.birthDate && (
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <CakeOutlinedIcon fontSize="small" color="action" />
                  <Typography variant="body2" color="text.secondary">
                    {t("quickView.birthDate")}
                  </Typography>
                  <Typography variant="body2" fontWeight={500}>
                    {dayjs(patient.birthDate).format("DD.MM.YYYY")}
                    {formatPatientAge(patient.birthDate) ? ` (${formatPatientAge(patient.birthDate)})` : ""}
                  </Typography>
                </Stack>
              )}

              {(patient.gender === "male" || patient.gender === "female") && (
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <WcOutlinedIcon fontSize="small" color="action" />
                  <Typography variant="body2" color="text.secondary">
                    {t("quickView.gender")}
                  </Typography>
                  <Typography variant="body2" fontWeight={500}>
                    {patient.gender === "male" ? t("quickView.genderMale") : t("quickView.genderFemale")}
                  </Typography>
                </Stack>
              )}

              {patient.address && (
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <PlaceOutlinedIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      {t("quickView.address")}
                    </Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {patient.address}
                    </Typography>
                  </Box>
                </Stack>
              )}

              {patient.family && (
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <GroupOutlinedIcon fontSize="small" color="action" />
                  <Typography variant="body2" color="text.secondary">
                    {t("quickView.family")}
                  </Typography>
                  <Typography variant="body2" fontWeight={500}>
                    {patient.family.name} ({patient.family.memberCount})
                  </Typography>
                </Stack>
              )}
            </Stack>
            )}

            <Divider />

            {/* История посещений: вся, с раскрытием. Строка кликабельна —
                открывает тот приём, поэтому искать его в списке не нужно. */}
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <MedicalServicesOutlinedIcon fontSize="small" color="primary" />
                <Typography variant="subtitle2" fontWeight={600}>
                  {visits.length > 0
                    ? t("quickView.visitsHistoryCount", { count: visits.length })
                    : t("quickView.visitsHistory")}
                </Typography>
              </Stack>

              {visitsLoading ? (
                <Stack spacing={1}>
                  <Skeleton variant="rectangular" height={56} />
                  <Skeleton variant="rectangular" height={56} />
                </Stack>
              ) : visits.length > 0 ? (
                <>
                  <List disablePadding>
                    {(visitsExpanded ? visits : visits.slice(0, COLLAPSED_LIMIT)).map((appt) => {
                      return (
                        <ListItem
                          key={appt.id}
                          onClick={() => openVisit(appt.id)}
                          sx={{
                            px: 1,
                            mx: -1,
                            py: 1.5,
                            borderRadius: "10px",
                            cursor: "pointer",
                            borderBottom: 1,
                            borderColor: "divider",
                            "&:last-child": { borderBottom: 0 },
                            "&:hover": { bgcolor: "action.hover" },
                          }}
                        >
                          <ListItemText
                            primary={
                              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                                <Typography variant="body2" fontWeight={500}>
                                  {dayjs(appt.scheduledAt).format("D MMMM YYYY, HH:mm")}
                                </Typography>
                                <AppointmentStatusChips appointment={appt} chipHeight={20} />
                              </Stack>
                            }
                            secondary={
                              <>
                                <Typography variant="caption" display="block" color="text.secondary">
                                  {t("quickView.doctorLabel", { name: doctorsLabel(appt) })}
                                </Typography>
                                <Typography variant="caption" display="block" color="text.secondary">
                                  {t("quickView.servicesLabel", { name: servicesLabel(appt) })}
                                </Typography>
                              </>
                            }
                          />
                        </ListItem>
                      );
                    })}
                  </List>

                  {visits.length > COLLAPSED_LIMIT && (
                    <Button
                      size="small"
                      onClick={() => setVisitsExpanded((prev) => !prev)}
                      sx={{ mt: 1, textTransform: "none" }}
                    >
                      {visitsExpanded
                        ? t("quickView.visitsCollapse")
                        : t("quickView.visitsShowAll", {
                            count: visits.length - COLLAPSED_LIMIT,
                          })}
                    </Button>
                  )}
                </>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                  {t("quickView.noVisits")}
                </Typography>
              )}
            </Box>
          </Stack>
        ) : (
          <Box sx={{ py: 4, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              {t("quickView.notFound")}
            </Typography>
            {loadError && (
              <Typography variant="caption" color="text.disabled" sx={{ wordBreak: "break-word" }}>
                {loadError}
              </Typography>
            )}
          </Box>
        )}
      </Box>

      <DjangoEditPatientDrawer
        open={editOpen}
        patient={patient}
        onClose={() => setEditOpen(false)}
        onUpdated={handleUpdated}
      />
    </Drawer>
  );
};

export default DjangoPatientQuickViewDrawer;
