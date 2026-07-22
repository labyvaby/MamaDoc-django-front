import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  Box,
  Stack,
  Typography,
  Avatar,
  Chip,
  Divider,
  CircularProgress,
  Card,
  CardHeader,
  CardContent,
  List,
  ListItemButton,
  IconButton,
  Link,
  SwipeableDrawer,
  Skeleton,
  Button,
} from "@mui/material";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import LocalPhoneOutlined from "@mui/icons-material/LocalPhoneOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import LogoutOutlined from "@mui/icons-material/LogoutOutlined";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import PhoneInTalkOutlined from "@mui/icons-material/PhoneInTalkOutlined";
import PictureAsPdfOutlined from "@mui/icons-material/PictureAsPdfOutlined";
import { getStatusConfig, getStatusChipSx } from "../../config/appointmentStatuses";
import { supabase } from "../../utility/supabaseClient";
import { useClientSession } from "../../contexts/client-session-context";
import AximoLogo from "../../components/auth/AximoLogo";
import dayjs from "dayjs";

type Appointment = {
  id: string;
  appointment_at: string;
  status: string;
  service_names?: string;
  doctor_name?: string;
  total_cost?: number;
};

type AppointmentDetail = {
  id: string;
  appointment_at: string;
  status: string;
  service_names?: string;
  doctor_name?: string;
  total_cost?: number;
  paid_cash?: number;
  paid_card?: number;
  discount?: number;
  debt?: number;
  complaints?: string | null;
  diagnosis_code?: string | null;
  diagnosis_title?: string | null;
  has_conclusion?: boolean;
  weight?: number | null;
  height?: number | null;
  temperature?: number | null;
  services_json?: any;
};


function calculateAge(birthDateStr: string): string {
  const birth = new Date(birthDateStr);
  const now = new Date();
  if (isNaN(birth.getTime())) return "";
  let y = now.getFullYear() - birth.getFullYear();
  let m = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) m--;
  if (m < 0) { m += 12; y--; }
  const yStr = getDeclension(y, ["год", "года", "лет"]);
  const mStr = getDeclension(m, ["месяц", "месяца", "месяцев"]);
  if (y === 0 && m === 0) return "(меньше месяца)";
  if (y === 0) return `(${m} ${mStr})`;
  if (m === 0) return `(${y} ${yStr})`;
  return `(${y} ${yStr} и ${m} ${mStr})`;
}

function getDeclension(n: number, t: [string, string, string]): string {
  const c = [2, 0, 1, 1, 1, 2];
  return t[n % 100 > 4 && n % 100 < 20 ? 2 : c[n % 10 < 5 ? n % 10 : 5]];
}

function formatKGS(v?: number | null) {
  if (v == null) return "—";
  return `${v.toLocaleString("ru")} сом`;
}

const ClientProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { patient, logout } = useClientSession();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AppointmentDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!patient) navigate("/client/login", { replace: true });
  }, [patient, navigate]);

  const fetchAppointments = useCallback(async () => {
    if (!patient) return;
    setLoadingAppts(true);
    try {
      const { data, error } = await supabase.rpc("get_client_appointments", {
        p_patient_id: patient.id,
        p_phone: patient.phone ?? "",
      });
      if (error) throw error;
      setAppointments(data ?? []);
    } catch {
      // оставляем пустой список
    } finally {
      setLoadingAppts(false);
    }
  }, [patient]);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

  const openDetail = useCallback(async (apptId: string) => {
    if (!patient) return;
    setSelectedId(apptId);
    setDetail(null);
    setSheetOpen(true);
    setLoadingDetail(true);
    try {
      const { data, error } = await supabase.rpc("get_client_appointment_detail", {
        p_appointment_id: apptId,
        p_patient_id: patient.id,
        p_phone: patient.phone ?? "",
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setDetail(row ?? null);
    } catch {
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, [patient]);

  const closeSheet = () => {
    setSheetOpen(false);
    setSelectedId(null);
    setDetail(null);
  };

  const handleLogout = () => {
    logout();
    navigate("/client/login", { replace: true });
  };

  if (!patient) return null;

  const services: any[] = (() => {
    if (!detail?.services_json) return [];
    try { return Array.isArray(detail.services_json) ? detail.services_json : JSON.parse(detail.services_json); }
    catch { return []; }
  })();


  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", pb: 3 }}>

      {/* Топбар */}
      <Box sx={{ px: 2, py: 1, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
        <AximoLogo compact size={36} />
        <IconButton size="small" onClick={handleLogout} title="Выйти">
          <LogoutOutlined fontSize="small" />
        </IconButton>
      </Box>

      <Stack spacing={1.5} sx={{ px: 1.5, pt: 1.5, maxWidth: 600, mx: "auto" }}>

        {/* Карточка пациента */}
        <Card variant="outlined">
          <CardHeader
            title={<Stack direction="row" alignItems="center" gap={1.25}><PersonOutlineOutlined color="primary" /><Typography variant="h6">Карточка пациента</Typography></Stack>}
            sx={{ pb: 1 }}
          />
          <Divider />
          <CardContent sx={{ p: 2 }}>
            <Stack direction="row" alignItems="center" spacing={2}>
              <Avatar src={patient.photo ?? undefined} sx={{ width: 64, height: 64 }} />
              <Box>
                <Typography variant="h6" sx={{ lineHeight: 1.2 }}>{patient.fio}</Typography>
                {patient.phone ? (
                  <Link href={`tel:${patient.phone}`} sx={{ display: "flex", alignItems: "center", gap: 1, color: "text.secondary", textDecoration: "none", mt: 0.5, "&:hover": { color: "primary.onSurface" } }}>
                    <PhoneInTalkOutlined fontSize="small" sx={{ color: "primary.onSurface" }} />
                    <Typography variant="body2">{patient.phone}</Typography>
                  </Link>
                ) : (
                  <Stack direction="row" alignItems="center" gap={1} color="text.secondary" sx={{ mt: 0.5 }}>
                    <LocalPhoneOutlined fontSize="small" /><Typography variant="body2">—</Typography>
                  </Stack>
                )}
                {patient.birth_date && (
                  <Stack direction="row" alignItems="center" gap={1} color="text.secondary" sx={{ mt: 0.5 }}>
                    <CalendarMonthOutlined fontSize="small" />
                    <Typography variant="body2">{dayjs(patient.birth_date).format("DD.MM.YYYY")} {calculateAge(patient.birth_date)}</Typography>
                  </Stack>
                )}
              </Box>
            </Stack>
          </CardContent>
        </Card>

        {/* История приёмов */}
        <Card variant="outlined">
          <CardHeader
            title={
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Stack direction="row" alignItems="center" gap={1.25}><HistoryOutlined color="primary" /><Typography variant="h6">История приёмов</Typography></Stack>
                {!loadingAppts && <Chip size="small" label={appointments.length} />}
              </Stack>
            }
            sx={{ pb: 1 }}
          />
          <Divider />
          <CardContent sx={{ p: 0 }}>
            {loadingAppts ? (
              <Stack alignItems="center" py={3}><CircularProgress size={24} /></Stack>
            ) : appointments.length === 0 ? (
              <Typography variant="body2" color="text.secondary" align="center" sx={{ p: 2 }}>История пуста</Typography>
            ) : (
              <List disablePadding sx={{ px: 1, py: 0.5 }}>
                {appointments.map((appt) => {
                  const sc = getStatusConfig(appt.status);
                  return (
                    <ListItemButton
                      key={appt.id}
                      selected={selectedId === appt.id}
                      onClick={() => openDetail(appt.id)}
                      sx={{ px: 2, py: 1.25, my: "5px", border: "1px solid", borderColor: "divider", borderRadius: 1, alignItems: "flex-start" }}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2} sx={{ width: "100%" }}>
                        <Stack>
                          <Typography variant="subtitle2">{dayjs(appt.appointment_at).format("HH:mm DD.MM.YYYY")}</Typography>
                          {appt.doctor_name && <Typography variant="body2" color="text.secondary">Врач: {appt.doctor_name}</Typography>}
                          {appt.service_names && <Typography variant="body2" color="text.secondary">Услуга: {appt.service_names}</Typography>}
                        </Stack>
                        <Stack alignItems="flex-end" flexShrink={0}>
                          {appt.total_cost != null && appt.total_cost > 0 && (
                            <Typography variant="body2" color="text.secondary" fontWeight="medium">{appt.total_cost.toLocaleString("ru")} сом</Typography>
                          )}
                          <Chip label={sc.label} size="small" icon={sc.icon} sx={(theme) => ({ mt: 0.5, ...(getStatusChipSx(appt.status) as any)(theme) })} />
                        </Stack>
                      </Stack>
                    </ListItemButton>
                  );
                })}
              </List>
            )}
          </CardContent>
        </Card>

      </Stack>

      {/* Bottom Sheet — детали приёма */}
      <SwipeableDrawer
        anchor="bottom"
        open={sheetOpen}
        onOpen={() => {}}
        onClose={closeSheet}
        disableSwipeToOpen
        PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "90dvh", overflow: "hidden", display: "flex", flexDirection: "column" } }}
      >
        <Box sx={{ display: "flex", justifyContent: "center", pt: 1, pb: 0.5, flexShrink: 0 }}>
          <Box sx={{ width: 36, height: 4, borderRadius: "14px", bgcolor: "grey.300" }} />
        </Box>

        <Box sx={{ px: 2, pb: 1, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <Typography variant="h6">Детали приёма</Typography>
          <IconButton size="small" onClick={closeSheet}><CloseIcon fontSize="small" /></IconButton>
        </Box>
        <Divider />

        <Box sx={{ flex: 1, overflowY: "auto", px: 2, py: 2 }}>
          {loadingDetail ? (
            <Stack spacing={2}>
              <Skeleton variant="text" width="50%" height={28} />
              <Skeleton variant="text" width="70%" />
              <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 1 }} />
              <Skeleton variant="text" width="40%" />
            </Stack>
          ) : !detail ? (
            <Typography color="text.secondary" align="center" py={4}>Данные не найдены</Typography>
          ) : (
            <Stack spacing={2}>

              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Stack>
                  <Typography variant="subtitle2" color="text.secondary">Дата и время</Typography>
                  <Typography variant="body1" fontWeight={500}>{dayjs(detail.appointment_at).format("HH:mm, DD.MM.YYYY")}</Typography>
                </Stack>
                {detail && (() => { const sc = getStatusConfig(detail.status); return <Chip label={sc.label} size="small" icon={sc.icon} sx={(theme) => (getStatusChipSx(detail.status) as any)(theme)} />; })()}
              </Stack>

              {detail.doctor_name && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">Врач</Typography>
                  <Typography variant="body1">{detail.doctor_name}</Typography>
                </Box>
              )}

              <Divider />

              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>Услуги</Typography>
                {services.length > 0 ? (
                  <Stack spacing={0.5}>
                    {services.map((srv: any, idx: number) => (
                      <Stack key={idx} direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2" sx={{ flex: 1, mr: 1 }}>{srv.name || srv.service_name || "—"}</Typography>
                        <Typography variant="body2" fontWeight={600}>{formatKGS(srv.price || srv.cost)}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary">{detail.service_names || "—"}</Typography>
                )}
              </Box>

              <Divider />

              <Stack spacing={0.75}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Итого</Typography>
                  <Typography variant="body2" fontWeight={700} color="primary.onSurface">{formatKGS(detail.total_cost)}</Typography>
                </Stack>
                {(detail.paid_cash ?? 0) > 0 && (
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Наличные</Typography>
                    <Typography variant="body2">{formatKGS(detail.paid_cash)}</Typography>
                  </Stack>
                )}
                {(detail.paid_card ?? 0) > 0 && (
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Карта</Typography>
                    <Typography variant="body2">{formatKGS(detail.paid_card)}</Typography>
                  </Stack>
                )}
                {(detail.discount ?? 0) > 0 && (
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Скидка</Typography>
                    <Typography variant="body2" color="warning.main">−{formatKGS(detail.discount)}</Typography>
                  </Stack>
                )}
                {(detail.debt ?? 0) > 0 && (
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Долг</Typography>
                    <Typography variant="body2" color="error.main">{formatKGS(detail.debt)}</Typography>
                  </Stack>
                )}
              </Stack>

              {(detail.weight || detail.height || detail.temperature) && (
                <>
                  <Divider />
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    {detail.height && <Chip label={`Рост: ${detail.height} см`} size="small" variant="outlined" />}
                    {detail.weight && <Chip label={`Вес: ${detail.weight} кг`} size="small" variant="outlined" />}
                    {detail.temperature && (
                      <Chip label={`Темп: ${detail.temperature} °C`} size="small" variant="outlined" color={detail.temperature > 37 ? "warning" : "default"} />
                    )}
                  </Stack>
                </>
              )}

              {detail.complaints && (
                <>
                  <Divider />
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>Жалобы</Typography>
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{detail.complaints}</Typography>
                  </Box>
                </>
              )}

              {(detail.diagnosis_code || detail.diagnosis_title) && (
                <>
                  <Divider />
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>Диагноз</Typography>
                    <Typography variant="body2">
                      {detail.diagnosis_code ? `${detail.diagnosis_code} — ` : ""}{detail.diagnosis_title}
                    </Typography>
                  </Box>
                </>
              )}

              {detail.has_conclusion && (
                <>
                  <Divider />
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<PictureAsPdfOutlined />}
                    href={`/print/conclusion/${detail.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    component="a"
                  >
                    Заключение (PDF)
                  </Button>
                </>
              )}

            </Stack>
          )}
        </Box>
      </SwipeableDrawer>

    </Box>
  );
};

export default ClientProfilePage;
