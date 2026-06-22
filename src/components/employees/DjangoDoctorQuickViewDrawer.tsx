import React from "react";
import {
  Avatar,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import WorkOutlineIcon from "@mui/icons-material/WorkOutline";
import MedicalServicesIcon from "@mui/icons-material/MedicalServices";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import dayjs from "dayjs";
import "dayjs/locale/ru";

import {
  getDjangoEmployee,
  getEmployeeServices,
  type DjangoEmployee,
  type EmployeeServiceAssignment,
} from "../../api/staff";
import { getServices, type Service } from "../../api/catalog";
import { getAppointments, type DjangoAppointment } from "../../api/appointments";
import { getStatusConfig, normalizeDjangoStatus } from "../../config/appointmentStatuses";

dayjs.locale("ru");

type Props = {
  open: boolean;
  onClose: () => void;
  doctorId: number | null;
  /** Имя/фото из приёма — показываем сразу, даже если у зрителя нет staff.view. */
  fallbackName?: string | null;
  fallbackPhotoUrl?: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  doctor: "Врач",
  nurse: "Медсестра",
  other: "Сотрудник",
};

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function som(value?: string | number | null): string {
  if (value == null || value === "") return "";
  const n = Number(value);
  return isNaN(n) ? "" : `${n.toLocaleString("ru-RU")} сом`;
}

const DjangoDoctorQuickViewDrawer: React.FC<Props> = ({
  open,
  onClose,
  doctorId,
  fallbackName,
  fallbackPhotoUrl,
}) => {
  const [loading, setLoading] = React.useState(false);
  const [employee, setEmployee] = React.useState<DjangoEmployee | null>(null);
  const [assignments, setAssignments] = React.useState<EmployeeServiceAssignment[]>([]);
  const [priceById, setPriceById] = React.useState<Map<number, string>>(new Map());
  const [appointments, setAppointments] = React.useState<DjangoAppointment[]>([]);

  React.useEffect(() => {
    if (!doctorId || !open) {
      setEmployee(null);
      setAssignments([]);
      setAppointments([]);
      return;
    }
    let active = true;
    const ctrl = new AbortController();
    setLoading(true);
    // Every fetch is best-effort: staff.view endpoints fail for a doctor
    // viewing themselves, but appointments are always visible — so the drawer
    // never ends up empty.
    Promise.all([
      getDjangoEmployee(doctorId, ctrl.signal).catch(() => null),
      getEmployeeServices(doctorId, ctrl.signal).catch(() => [] as EmployeeServiceAssignment[]),
      getServices(null, ctrl.signal).catch(() => [] as Service[]),
      getAppointments({ employeeId: doctorId }, ctrl.signal).catch(() => [] as DjangoAppointment[]),
    ])
      .then(([emp, svc, catalog, appts]) => {
        if (!active) return;
        setEmployee(emp);
        setAssignments(svc.filter((a) => a.isActive));
        setPriceById(new Map(catalog.map((s) => [s.id, s.basePrice])));
        setAppointments(
          [...appts]
            .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
            .slice(0, 6),
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      ctrl.abort();
    };
  }, [doctorId, open]);

  const name = employee?.fullName ?? fallbackName ?? "";
  const photoUrl = employee?.photoUrl ?? fallbackPhotoUrl ?? null;
  const roleLabel = employee ? ROLE_LABEL[employee.clinicalRole] ?? "Сотрудник" : "Врач";

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
          Информация о враче
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
        {loading && !name ? (
          <Stack spacing={2}>
            <Skeleton variant="rectangular" height={64} />
            <Skeleton variant="text" width="50%" />
            <Skeleton variant="text" width="80%" />
          </Stack>
        ) : name ? (
          <Stack spacing={2.5}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Avatar
                src={photoUrl ?? undefined}
                sx={{ width: 56, height: 56, bgcolor: "primary.main", fontWeight: 700 }}
              >
                {initials(name)}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" fontWeight={600} noWrap>
                  {name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {roleLabel}
                </Typography>
              </Box>
            </Stack>

            {employee && employee.specializations.length > 0 && (
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                {employee.specializations.map((sp) => (
                  <Chip
                    key={sp.id}
                    label={sp.name}
                    size="small"
                    icon={<WorkOutlineIcon />}
                    variant="outlined"
                  />
                ))}
              </Stack>
            )}

            {assignments.length > 0 && (
              <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <MedicalServicesIcon fontSize="small" color="success" />
                  <Typography variant="subtitle2" fontWeight={600}>
                    Оказываемые услуги
                  </Typography>
                </Stack>
                <Stack divider={<Divider flexItem />}>
                  {assignments.map((a) => {
                    const price = a.priceOverride ?? priceById.get(a.service.id) ?? null;
                    return (
                      <Stack
                        key={a.id}
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        sx={{ py: 1, gap: 2 }}
                      >
                        <Typography variant="body2" fontWeight={600}>
                          {a.service.name}
                        </Typography>
                        {som(price) && (
                          <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
                            {som(price)}
                          </Typography>
                        )}
                      </Stack>
                    );
                  })}
                </Stack>
              </Box>
            )}

            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <EventOutlinedIcon fontSize="small" color="primary" />
                <Typography variant="subtitle2" fontWeight={600}>
                  Последние приёмы
                </Typography>
              </Stack>
              {appointments.length === 0 ? (
                <Typography variant="body2" color="text.disabled">
                  Нет приёмов
                </Typography>
              ) : (
                <Stack spacing={1.5}>
                  {appointments.map((a) => {
                    const cfg = getStatusConfig(normalizeDjangoStatus(a.status));
                    const serviceNames = a.services
                      .map((sl) => sl.service?.name)
                      .filter(Boolean)
                      .join(", ");
                    return (
                      <Box key={a.id}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Typography variant="body2" fontWeight={600}>
                            {dayjs(a.scheduledAt).format("HH:mm DD.MM.YYYY")}
                          </Typography>
                          <Chip label={cfg.label} size="small" variant="outlined" />
                        </Stack>
                        {a.patient?.fullName && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            Пациент: {a.patient.fullName}
                          </Typography>
                        )}
                        {serviceNames && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            Услуги: {serviceNames}
                          </Typography>
                        )}
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </Box>
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
            Врач не найден
          </Typography>
        )}
      </Box>
    </Drawer>
  );
};

export default DjangoDoctorQuickViewDrawer;
