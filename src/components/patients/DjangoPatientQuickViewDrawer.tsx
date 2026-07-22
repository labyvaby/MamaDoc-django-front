import React from "react";
import {
  Avatar,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import LocalPhoneOutlinedIcon from "@mui/icons-material/LocalPhoneOutlined";
import CakeOutlinedIcon from "@mui/icons-material/CakeOutlined";
import WcOutlinedIcon from "@mui/icons-material/WcOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import MedicalServicesOutlinedIcon from "@mui/icons-material/MedicalServicesOutlined";
import dayjs from "dayjs";
import { formatPatientAge } from "../../utility/age";
import "dayjs/locale/ru";

import { getPatient, type DjangoPatient } from "../../api/patients";
import { getAppointments, type DjangoAppointment } from "../../api/appointments";
import {
  getStatusConfig,
  getStatusChipSx,
  normalizeDjangoStatus,
} from "../../config/appointmentStatuses";

dayjs.locale("ru");

type Props = {
  open: boolean;
  onClose: () => void;
  patientId: number | null;
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
  return `${names.length} исполнит.`;
}

function servicesLabel(appt: DjangoAppointment): string {
  if (appt.services.length === 0) return "—";
  if (appt.services.length === 1) return appt.services[0].service?.name ?? "—";
  return `${appt.services.length} услуг`;
}

const RECENT_LIMIT = 5;

const DjangoPatientQuickViewDrawer: React.FC<Props> = ({ open, onClose, patientId }) => {
  const [loading, setLoading] = React.useState(false);
  const [patient, setPatient] = React.useState<DjangoPatient | null>(null);
  const [recent, setRecent] = React.useState<DjangoAppointment[]>([]);
  const [recentLoading, setRecentLoading] = React.useState(false);

  React.useEffect(() => {
    if (!patientId || !open) {
      setPatient(null);
      setRecent([]);
      return;
    }
    let active = true;
    setLoading(true);
    getPatient(patientId)
      .then((p) => {
        if (active) setPatient(p);
      })
      .catch(() => {
        if (active) setPatient(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    setRecentLoading(true);
    getAppointments({ patientId })
      .then((rows) => {
        if (!active) return;
        const sorted = [...rows].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
        setRecent(sorted.slice(0, RECENT_LIMIT));
      })
      .catch(() => {
        if (active) setRecent([]);
      })
      .finally(() => {
        if (active) setRecentLoading(false);
      });

    return () => {
      active = false;
    };
  }, [patientId, open]);

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
          Информация о пациенте
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
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
        ) : patient ? (
          <Stack spacing={2.5}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Avatar
                src={patient.photoUrl ?? undefined}
                sx={{ width: 56, height: 56, bgcolor: "primary.main", fontWeight: 700 }}
              >
                {initials(patient.fullName)}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" fontWeight={600} noWrap>
                  {patient.fullName}
                </Typography>
                <Chip
                  label="Пациент"
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ mt: 0.5 }}
                />
              </Box>
            </Stack>

            <Divider />

            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <LocalPhoneOutlinedIcon fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">
                  Телефон:
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
                    Дата рождения:
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
                    Пол:
                  </Typography>
                  <Typography variant="body2" fontWeight={500}>
                    {patient.gender === "male" ? "Мальчик" : "Девочка"}
                  </Typography>
                </Stack>
              )}

              {patient.address && (
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <PlaceOutlinedIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Адрес:
                    </Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {patient.address}
                    </Typography>
                  </Box>
                </Stack>
              )}
            </Stack>

            <Divider />

            {/* Последние приёмы */}
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <MedicalServicesOutlinedIcon fontSize="small" color="primary" />
                <Typography variant="subtitle2" fontWeight={600}>
                  Последние приёмы
                </Typography>
              </Stack>

              {recentLoading ? (
                <Stack spacing={1}>
                  <Skeleton variant="rectangular" height={56} />
                  <Skeleton variant="rectangular" height={56} />
                </Stack>
              ) : recent.length > 0 ? (
                <List disablePadding>
                  {recent.map((appt) => {
                    const displayStatus = normalizeDjangoStatus(appt.status);
                    const statusCfg = getStatusConfig(displayStatus);
                    return (
                      <ListItem
                        key={appt.id}
                        sx={{
                          px: 0,
                          py: 1.5,
                          borderBottom: 1,
                          borderColor: "divider",
                          "&:last-child": { borderBottom: 0 },
                        }}
                      >
                        <ListItemText
                          primary={
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                              <Typography variant="body2" fontWeight={500}>
                                {dayjs(appt.scheduledAt).format("D MMMM YYYY, HH:mm")}
                              </Typography>
                              <Chip
                                label={statusCfg.label}
                                icon={statusCfg.icon}
                                size="small"
                                sx={{ ...getStatusChipSx(displayStatus), height: 20 }}
                              />
                            </Stack>
                          }
                          secondary={
                            <>
                              <Typography variant="caption" display="block" color="text.secondary">
                                Врач: {doctorsLabel(appt)}
                              </Typography>
                              <Typography variant="caption" display="block" color="text.secondary">
                                Услуги: {servicesLabel(appt)}
                              </Typography>
                            </>
                          }
                        />
                      </ListItem>
                    );
                  })}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                  Нет записей о приёмах
                </Typography>
              )}
            </Box>
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
            Пациент не найден
          </Typography>
        )}
      </Box>
    </Drawer>
  );
};

export default DjangoPatientQuickViewDrawer;
