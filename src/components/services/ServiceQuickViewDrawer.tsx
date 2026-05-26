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
  Close as CloseIcon,
  MedicalServices as MedicalServicesIcon,
  AttachMoney as AttachMoneyIcon,
  Person as PersonIcon,
  CalendarMonth as CalendarIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import { supabase } from "../../utility/supabaseClient";
import { formatKGS } from "../../utility/format";
import { getStatusConfig, getStatusChipSx } from "../../config/appointmentStatuses";

dayjs.locale("ru");

// Интерфейс детальной информации об услуге
export interface ServiceDetail {
  id: string;
  name: string;
  price?: number | null;
  photoUrl?: string | null;
  employeeIds?: string[];
  description?: string | null;
  isActive?: boolean;
}

// Интерфейс для сотрудников, выполняющих услугу
interface ServiceEmployee {
  id: string;
  full_name: string;
  specialization?: string;
}

// Интерфейс для истории оказания услуги
interface ServiceHistory {
  id: string;
  appointment_at: string;
  formatted_date: string;
  patient_name: string;
  doctor_name: string;
  status: string;
}

export interface ServiceQuickViewDrawerProps {
  open: boolean;
  onClose: () => void;
  serviceId: string | null;
}

export const ServiceQuickViewDrawer: React.FC<ServiceQuickViewDrawerProps> = ({
  open,
  onClose,
  serviceId,
}) => {
  const [loading, setLoading] = useState(false);
  const [service, setService] = useState<ServiceDetail | null>(null);
  const [employees, setEmployees] = useState<ServiceEmployee[]>([]);
  const [recentHistory, setRecentHistory] = useState<ServiceHistory[]>([]);

  // Загрузка данных услуги
  useEffect(() => {
    if (!serviceId || !open) {
      setService(null);
      setEmployees([]);
      setRecentHistory([]);
      return;
    }

    let active = true;

    const fetchServiceData = async () => {
      try {
        setLoading(true);

        // Запрос данных услуги из таблицы Services
        const { data: serviceData, error: serviceError } = await supabase
          .from("Services")
          .select("sellable_item_id, name, image_url, price_som, description")
          .eq("sellable_item_id", serviceId)
          .maybeSingle();

        if (serviceError) {
          console.error("Ошибка загрузки услуги:", serviceError);
          throw serviceError;
        }

        // Запрос статуса активности
        let isActive = true;
        if (serviceData) {
          const { data: sItem } = await supabase
            .from("SellableItems")
            .select("is_active")
            .eq("id", serviceId)
            .maybeSingle();
          if (sItem) isActive = sItem.is_active;
        }

        // Запрос цены из таблицы Prices
        let currentPrice: number | null = null;
        if (serviceData) {
          const { data: priceData } = await supabase
            .from("Prices")
            .select("price")
            .eq("sellable_item_id", serviceId)
            .eq("is_current", true)
            .maybeSingle();

          if (priceData) {
            currentPrice = priceData.price;
          }
        }

        // Fallback to price_som from Services table if needed
        const finalPrice = currentPrice ?? (serviceData?.price_som ? Number(serviceData.price_som) : null);

        // Запрос сотрудников, выполняющих услугу
        const { data: employeeLinksData } = await supabase
          .from("EmployeeServices")
          .select("employee_id")
          .eq("service_id", serviceId);

        const employeeIds = employeeLinksData?.map(link => link.employee_id) || [];

        if (active && serviceData) {
          setService({
            id: String(serviceData.sellable_item_id),
            name: serviceData.name || "Не указано",
            price: finalPrice,
            photoUrl: serviceData.image_url || null,
            employeeIds: employeeIds,
            description: serviceData.description || null,
            isActive: isActive,
          });
        }

        // Запрос данных сотрудников
        if (employeeIds.length > 0) {
          const { data: employeesData } = await supabase
            .from("Employees")
            .select(`
              id,
              full_name,
              roles (
                display_name
              )
            `)
            .in("id", employeeIds);

          if (active && employeesData) {
            setEmployees(
              employeesData.map((emp: any) => ({
                id: emp.id,
                full_name: emp.full_name || "Не указано",
                specialization: emp.roles?.display_name || undefined,
              }))
            );
          }
        }

        // Запрос последних 5 приемов с этой услугой
        // Используем services_json для поиска
        const { data: appointmentsData } = await supabase
          .from("AppointmentsAggregated")
          .select("id, appointment_at, formatted_date, patient_name, doctor_name, status, services_json")
          .order("appointment_at", { ascending: false })
          .limit(50); // Берем больше, чтобы отфильтровать

        if (active && appointmentsData) {
          // Фильтруем appointments, которые содержат эту услугу в services_json
          const filtered = appointmentsData.filter((apt: any) => {
            if (!apt.services_json) return false;

            try {
              const services = typeof apt.services_json === 'string'
                ? JSON.parse(apt.services_json)
                : apt.services_json;

              if (Array.isArray(services)) {
                return services.some((s: any) => s.id === serviceId || s.service_id === serviceId);
              }
            } catch (e) {
              return false;
            }

            return false;
          }).slice(0, 5); // Берем только первые 5

          setRecentHistory(
            filtered.map((apt: any) => ({
              id: String(apt.id),
              appointment_at: apt.appointment_at || "",
              formatted_date: apt.formatted_date || "",
              patient_name: apt.patient_name || "Не указан",
              doctor_name: apt.doctor_name || "Не указан",
              status: apt.status || "Неизвестно",
            }))
          );
        }
      } catch (error) {
        console.error("Ошибка при загрузке данных услуги:", error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchServiceData();

    return () => {
      active = false;
    };
  }, [serviceId, open]);

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
          Информация об услуге
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
        ) : service ? (
          <Stack spacing={3}>
            {/* Основная информация */}
            <Box>
              <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ mb: 2 }}>
                <Avatar
                  src={service.photoUrl || undefined}
                  sx={{
                    bgcolor: "success.main",
                    width: 56,
                    height: 56,
                  }}
                >
                  <MedicalServicesIcon />
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h6" fontWeight={600} gutterBottom>
                    {service.name}
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <Chip label="Услуга" size="small" color="primary" variant="outlined" />
                    <Chip
                      label={service.isActive ? "Активна" : "Неактивна"}
                      size="small"
                      color={service.isActive ? "success" : "default"}
                      variant="filled"
                    />
                  </Stack>
                </Box>
              </Stack>

              <Divider sx={{ my: 2 }} />

              {/* Стоимость */}
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <AttachMoneyIcon fontSize="small" color="action" />
                  <Typography variant="body2" color="text.secondary">
                    Стоимость:
                  </Typography>
                  <Typography variant="body2" fontWeight={500}>
                    {service.price ? formatKGS(service.price) : "Не указано"}
                  </Typography>
                </Stack>
              </Stack>

              {service.description && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Box>
                    <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                      Описание
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                      {service.description}
                    </Typography>
                  </Box>
                </>
              )}
            </Box>

            <Divider />

            {/* Сотрудники, выполняющие услугу */}
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <PersonIcon fontSize="small" color="primary" />
                <Typography variant="subtitle2" fontWeight={600}>
                  Сотрудники
                </Typography>
              </Stack>

              {employees.length > 0 ? (
                <List disablePadding>
                  {employees.map((employee) => (
                    <ListItem
                      key={employee.id}
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
                            {employee.full_name}
                          </Typography>
                        }
                        secondary={
                          employee.specialization && (
                            <Typography variant="caption" color="text.secondary">
                              {employee.specialization}
                            </Typography>
                          )
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                  Сотрудники не назначены
                </Typography>
              )}
            </Box>

            <Divider />

            {/* История оказания услуги */}
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <CalendarIcon fontSize="small" color="primary" />
                <Typography variant="subtitle2" fontWeight={600}>
                  Последние приемы
                </Typography>
              </Stack>

              {recentHistory.length > 0 ? (
                <List disablePadding>
                  {recentHistory.map((appointment) => (
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
                              Врач: {appointment.doctor_name}
                            </Typography>
                          </>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                  Нет записей об оказании услуги
                </Typography>
              )}
            </Box>
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
            Услуга не найдена
          </Typography>
        )}
      </Box>
    </Drawer>
  );
};

export default ServiceQuickViewDrawer;
