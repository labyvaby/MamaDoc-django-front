import React from "react";
import { useParams, Link as RouterLink, useNavigate } from "react-router";
import {
  Box,
  Breadcrumbs,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  Link,
  Stack,
  Typography,
  Button,
  Grid,
  useTheme
} from "@mui/material";
import ArrowBackIosNewOutlined from "@mui/icons-material/ArrowBackIosNewOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";

import CheckCircleOutlineOutlined from "@mui/icons-material/CheckCircleOutlineOutlined";
import HourglassEmptyOutlined from "@mui/icons-material/HourglassEmptyOutlined";

import { SubHeader } from "../../components";
import { supabase } from "../../utility/supabaseClient";
import { formatKGS } from "../../utility/format";
import { useNotification } from "@refinedev/core";
import { usePermissions } from "../../hooks/usePermissions";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import { getStatusConfig, getStatusChipSx } from "../../config/appointmentStatuses";
import EditAppointmentSidebar from "./components/EditAppointmentSidebar";

import { Appointment, mapAggregatedRowToAppointment, type AggregatedAppointmentRow } from "./types";

export const AppointmentDetailsPage: React.FC = () => {
  const { id } = useParams();
  const theme = useTheme();
  const navigate = useNavigate();
  const { open: notify } = useNotification();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [loading, setLoading] = React.useState(true);
  const [item, setItem] = React.useState<Appointment | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Sidebar редактирования приема
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const { hasPermission, isRegistrator, isAdmin, isSuperAdmin } = usePermissions();
  const canDelete = isSuperAdmin();

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!id) throw new Error("Missing id param");

        // Use the Aggregated View which has everything we need
        const { data, error } = await supabase
          .from("AppointmentsAggregated")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          setItem(null);
        } else {
          const mapped = mapAggregatedRowToAppointment(
            (data as AggregatedAppointmentRow) ?? {},
          );
          if (active) setItem(mapped);
        }
      } catch (e: unknown) {
        console.error(e);
        const errObj = (typeof e === "object" && e !== null ? e : {}) as {
          message?: string;
        };
        const msg = errObj.message || String(e);
        if (active) setErrorMsg(msg);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const isNight = item ? item.is_night : false;
  const statusIcon =
    item?.status === "Оплачено" ? <CheckCircleOutlineOutlined fontSize="small" /> : <HourglassEmptyOutlined fontSize="small" />;

  const handleDelete = async () => {
    if (!item || deleting) return;

    const confirmed = await confirm({
      title: "Удалить прием?",
      message: "Вы уверены, что хотите удалить этот прием? Это действие нельзя отменить.",
      confirmText: "Удалить",
      cancelText: "Отмена",
      variant: "error",
    });

    if (!confirmed) return;

    try {
      setDeleting(true);
      let errorFinal: unknown = null;
      try {
        const { error } = await supabase
          .schema("public")
          .from("Appointments")
          .delete()
          .eq("id", item.id);
        if (error) throw error;
        errorFinal = null;
      } catch (e1) {
        errorFinal = e1;
        try {
          const { error } = await supabase
            .schema("public")
            .from("Appointments")
            .delete()
            .eq("id", item.id);
          if (error) throw error;
          errorFinal = null;
        } catch (e2) {
          errorFinal = e2;
        }
      }
      if (errorFinal) throw errorFinal;

      // успех
      notify?.({
        type: "success",
        message: "Прием успешно удален",
      });
      navigate("/home");
    } catch (e) {
      console.error("Delete appointment failed:", e);
      notify?.({
        type: "error",
        message: "Не удалось удалить прием",
        description: e instanceof Error ? e.message : "Неизвестная ошибка",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box>
      <SubHeader
        title="Подробнее о приеме"
        actions={
          <Stack direction="row" spacing={1}>
            <Button component={RouterLink} to="/home" variant="text" startIcon={<ArrowBackIosNewOutlined />}>
              Назад
            </Button>

            {isSuperAdmin() && (
              <Button
                color="error"
                variant="outlined"
                disabled={!item || !canDelete || deleting}
                onClick={handleDelete}
              >
                {deleting ? "Удаление..." : "Удалить"}
              </Button>
            )}
            <Button
              variant="contained"
              onClick={() => {
                if (!item) return;
                setEditOpen(true);
              }}
              disabled={!item}
            >
              Редактировать
            </Button>
          </Stack>
        }
      />

      < Box sx={{ px: 2, py: 2 }}>
        <Breadcrumbs sx={{ mb: 2 }}>
          <Link component={RouterLink} to="/home" underline="hover" color="inherit">
            Главнаяыы
          </Link>
          <Typography color="text.primary">Подробнее о приеме</Typography>
        </Breadcrumbs>

        {/* Summary and totals */}
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Card variant="outlined">
              <CardHeader
                title={
                  loading ? (
                    "Загрузка…"
                  ) : item ? (
                    <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
                      <Typography variant="h6" component="span">
                        Пациент:
                      </Typography>
                      <Typography variant="h6" color="text.primary">
                        {item.patient_name || "Не указан"}
                      </Typography>
                      {(() => {
                        const isCardOnly = Number(item.paid_card || 0) > 0 && Number(item.paid_cash || 0) === 0;
                        const displayStatus = (item.status === "Оплачено" && isCardOnly) ? "Оплачено безналом" : item.status;
                        return (
                          <Chip
                            size="small"
                            label={getStatusConfig(displayStatus).label}
                            icon={getStatusConfig(displayStatus).icon}
                            sx={getStatusChipSx(displayStatus)}
                          />
                        );
                      })()}
                      {isNight && (
                        <Chip
                          size="small"
                          variant="outlined"
                          color="info"
                          label="Ночной"
                          icon={<NightlightOutlined fontSize="small" />}
                          sx={{ ml: 1 }}
                        />
                      )}
                    </Stack>
                  ) : (
                    <Typography variant="h6">Прием не найден</Typography>
                  )
                }
                subheader={
                  item ? (
                    <Stack direction="row" alignItems="center" gap={1}>
                      <CalendarMonthOutlined fontSize="small" />
                      <Typography variant="body2">{item.formatted_date}</Typography>
                    </Stack>
                  ) : undefined
                }
              />
              <Divider />
              <CardContent>
                {errorMsg ? (
                  <Typography variant="body2" color="error">
                    Ошибка: {errorMsg}
                  </Typography>
                ) : item ? (
                  <Stack spacing={2}>
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <Stack direction="row" alignItems="center" gap={1.25}>
                          <PersonOutlineOutlined color="primary" fontSize="small" />
                          <Typography variant="body2" color="text.secondary">
                            Доктор
                          </Typography>
                        </Stack>
                        <Typography variant="subtitle2">{item.doctor_name || "—"}</Typography>
                      </Grid>

                      <Grid item xs={12}>
                        <Stack direction="row" alignItems="center" gap={1.25}>
                          <MedicalServicesOutlined color="primary" fontSize="small" />
                          <Typography variant="body2" color="text.secondary">
                            Услуги и товары
                          </Typography>
                        </Stack>
                        {item.services_json && Array.isArray(item.services_json) && item.services_json.length > 0 ? (
                          <Stack spacing={0.5} sx={{ mt: 1 }}>
                            {item.services_json.map((service, idx) => (
                              <Stack key={idx} direction="row" justifyContent="space-between" alignItems="center">
                                <Typography variant="body2">
                                  {service.name || service.service_name || "—"}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {service.price || service.cost || 0} сом
                                </Typography>
                              </Stack>
                            ))}
                          </Stack>
                        ) : (
                          <Typography variant="subtitle2">{item.service_names || "—"}</Typography>
                        )}
                      </Grid>

                      <Grid item xs={12} sm={6}>
                        <Stack direction="row" alignItems="center" gap={1.25}>
                          <DescriptionOutlined color="primary" fontSize="small" />
                          <Typography variant="body2" color="text.secondary">
                            Заключение
                          </Typography>
                        </Stack>
                        <Typography variant="subtitle2">{item.complaints || "—"}</Typography>
                      </Grid>
                    </Grid>

                    {item.complaints && (
                      <Box>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          Жалобы при обращении (пациент)
                        </Typography>
                        <Typography variant="body2">{item.complaints}</Typography>
                      </Box>
                    )}

                    {item.doctor_complaints && (
                      <Box>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          Жалобы (врач)
                        </Typography>
                        <Typography variant="body2">{item.doctor_complaints}</Typography>
                      </Box>
                    )}

                    {item.admin_comment && (
                      <Box>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          Комментарий администратора
                        </Typography>
                        <Typography variant="body2">{item.admin_comment}</Typography>
                      </Box>
                    )}

                    <Divider />

                    {/* Итого к оплате */}
                    <Box
                      sx={{
                        bgcolor: 'success.light',
                        color: 'success.contrastText',
                        p: 2,
                        borderRadius: 1,
                        textAlign: 'center',
                      }}
                    >
                      <Typography variant="h4" fontWeight={700}>
                        {formatKGS(item.total_amount ?? item.total_cost)}
                      </Typography>
                    </Box>
                  </Stack>
                ) : null}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box >

      {/* Sidebar редактирования приема */}
      {
        item ? (
          <EditAppointmentSidebar
            key={item.id}
            isOpen={editOpen}
            onClose={() => setEditOpen(false)}
            item={item}
            onDeleted={() => {
              setEditOpen(false);
              navigate("/home");
            }}
            onSaved={() => {
              // item.id is stable
              // But we are reloading anyway
              window.location.reload();
            }}
          />
        ) : null
      }

      {/* Диалог подтверждения */}
      <ConfirmDialog />
    </Box >
  );
};

export default AppointmentDetailsPage;
