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
} from "@mui/material";
import {
  CloseOutlined as CloseIcon,
  PersonOutlined as PersonIcon,
  MedicalServicesOutlined as MedicalServicesIcon,
  CalendarMonthOutlined as CalendarIcon,
  WorkOutline as WorkIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import { supabase } from "../../utility/supabaseClient";
import { getStatusConfig, getStatusChipSx } from "../../config/appointmentStatuses";

dayjs.locale("ru");

// Интерфейс детальной информации о докторе
export interface DoctorDetail {
  id: string;
  fullName: string;
  photoUrl?: string | null;
  role?: string | null; // Должность (Врач, Медсестра и т.д.)
  specialization?: string | null; // Специализация (Педиатр, Хирург и т.д.)
  roleId?: string | null;
}

// Интерфейс для услуг доктора
interface DoctorService {
  id: string;
  name: string;
  price?: number;
}

// Интерфейс для истории приемов доктора
interface DoctorAppointment {
  id: string;
  appointment_at: string;
  formatted_date: string;
  patient_name: string;
  service_names: string;
  status: string;
}

export interface DoctorQuickViewDrawerProps {
  open: boolean;
  onClose: () => void;
  doctorId: string | null;
}

export const DoctorQuickViewDrawer: React.FC<DoctorQuickViewDrawerProps> = ({
  open,
  onClose,
  doctorId,
}) => {
  const [loading, setLoading] = useState(false);
  const [doctor, setDoctor] = useState<DoctorDetail | null>(null);
  const [services, setServices] = useState<DoctorService[]>([]);
  const [recentAppointments, setRecentAppointments] = useState<DoctorAppointment[]>([]);

  // Загрузка данных доктора
  useEffect(() => {
    if (!doctorId || !open) {
      setDoctor(null);
      setServices([]);
      setRecentAppointments([]);
      return;
    }

    let active = true;

    const fetchDoctorData = async () => {
      try {
        setLoading(true);

        // Запрос данных доктора из таблицы Employees
        const { data: doctorData, error: doctorError } = await supabase
          .from("Employees")
          .select("id, full_name, photo_url, role_id, employee_type_id, roles (name, display_name)")
          .eq("id", doctorId)
          .maybeSingle();

        if (doctorError) {
          console.error("Ошибка загрузки доктора:", doctorError);
          throw doctorError;
        }

        let specializationName = null;

        // Загружаем специализацию если есть employee_type_id
        if (active && doctorData && doctorData.employee_type_id) {
          try {
            const { data: specData } = await supabase
              .from("Specializations")
              .select("name")
              .eq("id", doctorData.employee_type_id)
              .maybeSingle();

            if (specData) {
              specializationName = specData.name;
            }
          } catch (e) {
            console.error("Ошибка загрузки специализации:", e);
          }
        }

        if (active && doctorData) {
          const roleData: any = doctorData.roles || {};
          const roleDisplay = roleData.display_name || roleData.name || "Врач";

          setDoctor({
            id: String(doctorData.id),
            fullName: doctorData.full_name || "Не указано",
            photoUrl: doctorData.photo_url || null,
            role: roleDisplay,
            specialization: specializationName,
            roleId: doctorData.role_id || null,
          });
        }

        // Запрос услуг, которые выполняет доктор
        const { data: serviceLinksData } = await supabase
          .from("EmployeeServices")
          .select("service_id")
          .eq("employee_id", doctorId);

        const serviceIds = serviceLinksData?.map(link => link.service_id) || [];

        if (serviceIds.length > 0) {
          // Запрос данных услуг
          const { data: servicesData } = await supabase
            .from("Services")
            .select("sellable_item_id, name")
            .in("sellable_item_id", serviceIds);

          // Запрос цен для услуг
          const { data: pricesData } = await supabase
            .from("Prices")
            .select("sellable_item_id, price")
            .eq("is_current", true)
            .in("sellable_item_id", serviceIds);

          const pricesMap = new Map<string, number>();
          pricesData?.forEach((p: any) => {
            if (p.sellable_item_id && p.price !== undefined) {
              pricesMap.set(p.sellable_item_id, Number(p.price));
            }
          });

          if (active && servicesData) {
            setServices(
              servicesData.map((service: any) => ({
                id: service.sellable_item_id,
                name: service.name || "Не указано",
                price: pricesMap.get(service.sellable_item_id),
              }))
            );
          }
        }

        // Запрос последних 5 приемов доктора
        const { data: appointmentsData, error: appointmentsError } = await supabase
          .from("AppointmentsAggregated")
          .select("id, appointment_at, formatted_date, patient_name, service_names, status")
          .eq("doctor_id", doctorId)
          .order("appointment_at", { ascending: false })
          .limit(5);

        if (appointmentsError) {
          console.error("Ошибка загрузки приемов:", appointmentsError);
        }

        if (active && appointmentsData) {
          setRecentAppointments(
            appointmentsData.map((apt: any) => ({
              id: String(apt.id),
              appointment_at: apt.appointment_at || "",
              formatted_date: apt.formatted_date || "",
              patient_name: apt.patient_name || "Не указан",
              service_names: apt.service_names || "Не указаны",
              status: apt.status || "Неизвестно",
            }))
          );
        }
      } catch (error) {
        console.error("Ошибка при загрузке данных доктора:", error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchDoctorData();

    return () => {
      active = false;
    };
  }, [doctorId, open]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: 320, sm: 480, md: 520 },
          maxWidth: "100vw",
          overscrollBehavior: "contain",
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
          Информация о враче
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
        ) : doctor ? (
          <Stack spacing={3}>
            {/* Основная информация */}
            <Box>
              <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ mb: 2 }}>
                <Avatar
                  src={doctor.photoUrl || undefined}
                  sx={{
                    bgcolor: "primary.main",
                    width: 56,
                    height: 56,
                  }}
                >
                  <PersonIcon />
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h6" fontWeight={600} gutterBottom>
                    {doctor.fullName}
                  </Typography>
                </Box>
              </Stack>

              <Divider sx={{ my: 2 }} />

              {/* Должность */}
              {doctor.role && (
                <Box sx={{ mb: doctor.specialization ? 2 : 0 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Должность
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>
                    {doctor.role}
                  </Typography>
                </Box>
              )}

              {/* Специализация (только для врачей) */}
              {doctor.specialization && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Специализация
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>
                    {doctor.specialization}
                  </Typography>
                </Box>
              )}
            </Box>

            <Divider />

            {/* Услуги врача */}
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <MedicalServicesIcon fontSize="small" color="success" />
                <Typography variant="subtitle2" fontWeight={600}>
                  Оказываемые услуги
                </Typography>
              </Stack>

              {services.length > 0 ? (
                <List disablePadding>
                  {services.map((service) => (
                    <ListItem
                      key={service.id}
                      sx={{
                        px: 0,
                        py: 1,
                        borderBottom: 1,
                        borderColor: "divider",
                        "&:last-child": {
                          borderBottom: 0,
                        },
                      }}
                    >
                      <ListItemText
                        primary={
                          <Typography variant="body2" fontWeight={500}>
                            {service.name}
                          </Typography>
                        }
                        secondary={
                          service.price !== undefined && (
                            <Typography variant="caption" color="text.secondary">
                              {service.price} сом
                            </Typography>
                          )
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                  Услуги не назначены
                </Typography>
              )}
            </Box>

            <Divider />

            {/* Последние приемы */}
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <CalendarIcon fontSize="small" color="primary" />
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
                              {appointment.formatted_date || dayjs(appointment.appointment_at).format("DD.MM.YYYY HH:mm")}
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
                              Пациент: {appointment.patient_name}
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
            Врач не найден
          </Typography>
        )}
      </Box>
    </Drawer>
  );
};

export default DoctorQuickViewDrawer;
