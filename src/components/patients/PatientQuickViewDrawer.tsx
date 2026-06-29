import React, { useEffect, useState } from "react";
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Divider,
  Stack,
  Skeleton,
  List,
  ListItem,
  ListItemText,
  Chip,
  Avatar,
  Button,
} from "@mui/material";
import {
  CloseOutlined as CloseIcon,
  PersonOutlined as PersonIcon,
  PhoneOutlined as PhoneIcon,
  CakeOutlined as CakeIcon,
  CalendarMonthOutlined as CalendarIcon,
  MedicalServicesOutlined as MedicalServicesIcon,
  BadgeOutlined as BadgeIcon,
  AddOutlined as AddIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);
import { supabase } from "../../utility/supabaseClient";
import { getStatusConfig, getStatusChipSx } from "../../config/appointmentStatuses";
import { calculateAgeWithMonths, formatDateRu } from "../../utility/format";

dayjs.locale("ru");

// Интерфейс детальной информации о пациенте
export interface PatientDetail {
  id: string;
  fio: string; // ФИО пациента
  phone?: string | null; // Телефон
  birthDate?: string | null; // Дата рождения
  inn?: string | null; // ИНН
  photo_url?: string | null; // Фото пациента
  comment?: string | null; // Комментарий/Особенности
  latestWeight?: number | null;
  latestHeight?: number | null;
  latestTemperature?: number | null;
}

// Тип строки пациента из БД (с поддержкой кириллических и "пробельных" названий колонок)
// Описываем только реально используемые поля, без использования типа `any`.
type PatientDbRow = {
  id: string | number;
  full_name?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  inn?: string | null;
  photo_url?: string | null;
  comment?: string | null;
};

// Интерфейс для последних приемов пациента
interface RecentAppointment {
  id: string;
  appointment_at: string;
  formatted_date: string;
  doctor_name: string;
  service_names: string;
  status: string;
}

export interface PatientQuickViewDrawerProps {
  open: boolean;
  onClose: () => void;
  patientId: string | null;
  onStartAppointment?: (patientId: string) => void;
}

export const PatientQuickViewDrawer: React.FC<PatientQuickViewDrawerProps> = ({
  open,
  onClose,
  patientId,
  onStartAppointment,
}) => {
  const [loading, setLoading] = useState(false);
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [recentAppointments, setRecentAppointments] = useState<RecentAppointment[]>([]);


  // Загрузка данных пациента
  useEffect(() => {
    if (!patientId || !open) {
      setPatient(null);
      setRecentAppointments([]);
      return;
    }

    let active = true;

    const fetchPatientData = async () => {
      try {
        setLoading(true);

        // Запрос данных пациента из таблицы Patients
        const { data: rawPatientData, error: patientError } = await supabase
          .from("Patients")
          .select('id, full_name, phone, birth_date, inn, photo_url, comment')
          .eq("id", patientId)
          .maybeSingle();

        const patientData = rawPatientData as unknown as PatientDbRow | null;

        if (patientError) {
          console.error("Ошибка загрузки пациента:", patientError);
          throw patientError;
        }

        // Запрос последних 5 приемов пациента
        const { data: appointmentsData, error: appointmentsError } = await supabase
          .from("AppointmentsAggregated")
          .select("id, appointment_at, formatted_date, doctor_name, service_names, status")
          .eq("patient_id", patientId)
          .order("appointment_at", { ascending: false })
          .limit(5);

        if (appointmentsError) {
          console.error("Ошибка загрузки приемов:", appointmentsError);
        }

        // Fetch latest vitals (separately or from appointments)
        const { data: vitalsData } = await supabase
          .from("Appointments")
          .select("weight, height, temperature")
          .eq("patient_id", patientId)
          .or("weight.not.is.null,height.not.is.null,temperature.not.is.null")
          .order("appointment_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (active && patientData) {
          setPatient({
            id: String(patientData.id),
            fio: patientData.full_name || "Не указано",
            phone: patientData.phone || null,
            birthDate: patientData.birth_date || null,
            inn: patientData.inn || null,
            photo_url: patientData.photo_url || null,
            comment: patientData.comment || null,
            latestWeight: vitalsData?.weight || null,
            latestHeight: vitalsData?.height || null,
            latestTemperature: vitalsData?.temperature || null,
          });
        }

        if (active && appointmentsData) {
          setRecentAppointments(
            appointmentsData.map((apt) => ({
              id: String(apt.id),
              appointment_at: apt.appointment_at || "",
              formatted_date: apt.formatted_date || "",
              doctor_name: apt.doctor_name || "Не указан",
              service_names: apt.service_names || "Не указаны",
              status: apt.status || "Неизвестно",
            }))
          );
        }
      } catch (error) {
        console.error("Ошибка при загрузке данных пациента:", error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchPatientData();

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
        },
      }}
    >
      {/* Заголовок */}
      <Box
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="h6" fontWeight={600}>
          Информация о пациенте
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Содержимое */}
      <Box
        sx={{
          p: 2,
          overflowY: "auto",
          flex: 1,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          '&::-webkit-scrollbar': {
            display: 'none',
          },
        }}
      >
        {loading ? (
          // Скелетон при загрузке
          <Stack spacing={2}>
            <Skeleton variant="rectangular" height={80} />
            <Skeleton variant="text" width="60%" />
            <Skeleton variant="text" width="80%" />
            <Skeleton variant="rectangular" height={200} />
          </Stack>
        ) : patient ? (
          <Stack spacing={3}>
            {/* Основная информация */}
            <Box>
              <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ mb: 2 }}>
                <Avatar
                  src={patient.photo_url || undefined}
                  sx={{
                    bgcolor: "primary.main",
                    width: 56,
                    height: 56,
                  }}
                >
                  {patient.fio?.charAt(0) || <PersonIcon />}
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h6" fontWeight={600} gutterBottom>
                    {patient.fio}
                  </Typography>
                  <Chip label="Пациент" size="small" color="primary" variant="outlined" />
                </Box>
              </Stack>

              <Divider sx={{ my: 2 }} />

              {/* Контактные данные */}
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <PhoneIcon fontSize="small" color="action" />
                  <Typography variant="body2" color="text.secondary">
                    Телефон:
                  </Typography>
                  <Typography variant="body2" fontWeight={500}>
                    {patient.phone || "Не указано"}
                  </Typography>
                </Stack>

                {patient.birthDate && (
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <CalendarIcon fontSize="small" color="action" />
                    <Typography variant="body2" color="text.secondary">
                      Дата рождения:
                    </Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {dayjs(patient.birthDate).format("DD.MM.YYYY")}
                      <Box component="span" sx={{ ml: 1, color: "text.secondary" }}>
                        {calculateAgeWithMonths(patient.birthDate)}
                      </Box>
                    </Typography>
                  </Stack>
                )}

                {patient.inn && (
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <BadgeIcon fontSize="small" color="action" />
                    <Typography variant="body2" color="text.secondary">
                      ИНН:
                    </Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {patient.inn}
                    </Typography>
                  </Stack>
                )}

                {/* Latest Vitals */}
                {(patient.latestWeight || patient.latestHeight || patient.latestTemperature) && (
                  <>
                    <Divider sx={{ my: 1 }} />
                    <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                      {patient.latestHeight && (
                        <Chip label={`Рост: ${patient.latestHeight} см`} size="small" variant="outlined" />
                      )}
                      {patient.latestWeight && (
                        <Chip label={`Вес: ${patient.latestWeight} кг`} size="small" variant="outlined" />
                      )}
                      {patient.latestTemperature && (
                        <Chip label={`Темп: ${patient.latestTemperature} °C`} size="small" variant="outlined" color={patient.latestTemperature > 37 ? "warning" : "default"} />
                      )}
                    </Stack>
                  </>
                )}
              </Stack>

              {/* Комментарий/Особенности */}
              {patient.comment && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Box>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Комментарий:
                    </Typography>
                    <Typography variant="body2">{patient.comment}</Typography>
                  </Box>
                </>
              )}
            </Box>

            <Divider />

            {/* Последние приемы */}
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <MedicalServicesIcon fontSize="small" color="primary" />
                <Typography variant="subtitle2" fontWeight={600}>
                  Последние приемы
                </Typography>
              </Stack>

              {recentAppointments.length > 0 ? (
                <List disablePadding>
                  {recentAppointments.map((appointment) => (
                    <ListItem
                      key={appointment.id}
                      sx={{
                        px: 0,
                        py: 1.5,
                        borderBottom: 1,
                        borderColor: "divider",
                        "&:last-child": {
                          borderBottom: 0,
                        },
                      }}
                    >
                      <ListItemText
                        primary={
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                            <Typography variant="body2" fontWeight={500}>
                              {appointment.appointment_at ? dayjs(appointment.appointment_at).tz("Asia/Bishkek").format("HH:mm DD.MM.YYYY") : appointment.formatted_date}
                            </Typography>
                            <Chip
                              label={getStatusConfig(appointment.status).label}
                              icon={getStatusConfig(appointment.status).icon}
                              size="small"
                              sx={{ ...getStatusChipSx(appointment.status), height: 20 }}
                            />
                          </Stack>
                        }
                        secondary={
                          <>
                            <Typography variant="caption" display="block" color="text.secondary">
                              Врач: {appointment.doctor_name}
                            </Typography>
                            <Typography variant="caption" display="block" color="text.secondary">
                              Услуги: {appointment.service_names}
                            </Typography>
                          </>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                  Нет записей о приемах
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

      {/* Footer с кнопкой "Начать прием" */}
      {onStartAppointment && patient && (
        <Box
          sx={{
            p: 2,
            borderTop: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          <Button
            variant="contained"
            color="primary"
            fullWidth
            size="large"
            startIcon={<AddIcon />}
            onClick={() => {
              onStartAppointment(patient.id);
              onClose();
            }}
          >
            Начать прием
          </Button>
        </Box>
      )}
    </Drawer>
  );
};

export default PatientQuickViewDrawer;
