import React from "react";
import {
  Box,
  Typography,
  Divider,
  Stack,
  Skeleton,
  Chip,
  Avatar,
  Card,
  CardHeader,
  CardContent,
  IconButton,
  Tooltip,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import MedicalServicesIcon from "@mui/icons-material/MedicalServicesOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import AccessTimeIcon from "@mui/icons-material/AccessTimeOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import NotesOutlinedIcon from "@mui/icons-material/NotesOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { getService } from "../../api/catalog";
import type { Service } from "../../api/catalog";
import { formatKGS } from "../../utility/format";
import { AppButton, InfoTile } from "../ui";
import { subtleBg } from "../../theme/uiHelpers";

type Props = {
  serviceId: number | null;
  /** Бампается родителем после редактирования — панель перечитывает услугу. */
  refreshToken?: number;
  onEdit?: (s: Service) => void;
  onDelete?: (s: Service) => void;
};

/** Форматирует длительность из минут в вид «45 мин» / «1 ч 15 мин». */
function formatDuration(min: number): string {
  if (!min || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

/** Заголовок секции: иконка-акцент + приглушённая подпись (как в карточке сотрудника). */
const SectionHeader: React.FC<{ icon: React.ReactNode; title: string }> = ({
  icon,
  title,
}) => (
  <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1.5 }}>
    <Box
      sx={{
        color: "primary.onSurface",
        display: "flex",
        "& .MuiSvgIcon-root": { fontSize: 18 },
      }}
    >
      {icon}
    </Box>
    <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
      {title}
    </Typography>
  </Stack>
);

/**
 * Панель с деталями услуги для правой колонки master-detail макета —
 * в едином стиле с карточкой сотрудника.
 */
const ServiceDetailsPanel: React.FC<Props> = ({
  serviceId,
  refreshToken = 0,
  onEdit,
  onDelete,
}) => {
  const [loading, setLoading] = React.useState(false);
  const [service, setService] = React.useState<Service | null>(null);

  React.useEffect(() => {
    if (!serviceId) {
      setService(null);
      return;
    }
    let active = true;
    setLoading(true);
    getService(serviceId)
      .then((s) => {
        if (active) setService(s);
      })
      .catch(() => {
        if (active) setService(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [serviceId, refreshToken]);

  return (
    <Card
      variant="outlined"
      sx={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      <CardHeader
        title={
          <Stack direction="row" alignItems="center" gap={1.25}>
            <Box
              sx={{
                width: 3,
                height: 16,
                borderRadius: 3,
                bgcolor: "primary.main",
              }}
            />
            <Typography variant="subtitle1" fontWeight={600}>
              Карточка услуги
            </Typography>
          </Stack>
        }
        action={
          service ? (
            <Stack direction="row" alignItems="center" gap={0.5}>
              {onEdit && (
                <AppButton
                  size="small"
                  startIcon={<EditOutlinedIcon fontSize="small" />}
                  onClick={() => onEdit(service)}
                >
                  Редактировать
                </AppButton>
              )}
              {onDelete && (
                <Tooltip title="Удалить услугу">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => onDelete(service)}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          ) : undefined
        }
      />
      <Divider />
      <CardContent sx={{ flex: 1, overflowY: "auto" }}>
        {!serviceId ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              py: 8,
              opacity: 0.6,
            }}
          >
            <MedicalServicesIcon
              sx={{ fontSize: 64, mb: 2, color: "text.secondary" }}
            />
            <Typography variant="body1" color="text.secondary">
              Выберите услугу из списка
            </Typography>
          </Box>
        ) : loading ? (
          <Stack spacing={2}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Skeleton variant="rounded" width={76} height={76} />
              <Box sx={{ flex: 1 }}>
                <Skeleton variant="text" width="60%" height={32} />
                <Skeleton variant="text" width="40%" />
              </Box>
            </Stack>
            <Skeleton variant="rounded" height={72} />
            <Skeleton variant="rounded" height={72} />
          </Stack>
        ) : service ? (
          <Stack spacing={3}>
            {/* Hero: изображение + название + чипы */}
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
              <Box sx={{ position: "relative", flexShrink: 0 }}>
                <Avatar
                  variant="rounded"
                  src={service.imageUrl ?? undefined}
                  sx={(t) => ({
                    width: 76,
                    height: 76,
                    borderRadius: "18px",
                    color: "primary.onSurface",
                    bgcolor: alpha(
                      t.palette.primary.main,
                      t.palette.mode === "dark" ? 0.16 : 0.1,
                    ),
                  })}
                >
                  <MedicalServicesIcon sx={{ fontSize: 32 }} />
                </Avatar>
                <Box
                  sx={(t) => ({
                    position: "absolute",
                    right: -2,
                    bottom: -2,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: `3px solid ${t.palette.background.paper}`,
                    bgcolor: service.isActive
                      ? t.palette.success.main
                      : t.palette.grey[500],
                  })}
                />
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  variant="h6"
                  fontWeight={700}
                  sx={{ letterSpacing: -0.2, lineHeight: 1.2 }}
                >
                  {service.name}
                </Typography>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ mt: 1, flexWrap: "wrap", rowGap: 0.75 }}
                >
                  <Chip
                    label="Услуга"
                    size="small"
                    sx={(t) => ({
                      fontWeight: 500,
                      height: 24,
                      borderRadius: "7px",
                      color: "primary.onSurface",
                      bgcolor: alpha(
                        t.palette.primary.main,
                        t.palette.mode === "dark" ? 0.18 : 0.1,
                      ),
                    })}
                  />
                  <Chip
                    size="small"
                    label={service.isActive ? "Активна" : "Неактивна"}
                    icon={
                      <Box
                        component="span"
                        sx={(t) => ({
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          bgcolor: service.isActive
                            ? t.palette.success.main
                            : t.palette.grey[500],
                          ml: 0.75,
                        })}
                      />
                    }
                    sx={(t) => {
                      const tone = service.isActive ? t.palette.success : null;
                      return {
                        fontWeight: 500,
                        height: 24,
                        borderRadius: "7px",
                        "& .MuiChip-icon": { ml: 0.75, mr: -0.25 },
                        color: tone
                          ? t.palette.mode === "dark"
                            ? tone.light
                            : tone.dark
                          : "text.secondary",
                        bgcolor: tone
                          ? alpha(tone.main, t.palette.mode === "dark" ? 0.2 : 0.14)
                          : subtleBg(t, true),
                      };
                    }}
                  />
                </Stack>
              </Box>
            </Stack>

            {/* Основное: стоимость + длительность */}
            <Box>
              <SectionHeader icon={<PaymentsOutlinedIcon />} title="Основное" />
              <Box
                sx={{
                  display: "grid",
                  gap: 1.25,
                  gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                }}
              >
                <InfoTile
                  icon={<PaymentsOutlinedIcon />}
                  label="Стоимость"
                  value={
                    service.basePrice
                      ? formatKGS(Number(service.basePrice))
                      : undefined
                  }
                  active={Boolean(service.basePrice)}
                />
                <InfoTile
                  icon={<AccessTimeIcon />}
                  label="Длительность"
                  value={
                    service.durationMinutes > 0
                      ? formatDuration(service.durationMinutes)
                      : undefined
                  }
                  active={service.durationMinutes > 0}
                />
              </Box>
            </Box>

            {/* Филиалы */}
            {service.branches.length > 0 && (
              <Box>
                <SectionHeader icon={<PlaceOutlinedIcon />} title="Филиалы" />
                <Stack direction="row" flexWrap="wrap" gap={1}>
                  {service.branches.map((b) => (
                    <Chip
                      key={b.id}
                      label={b.name}
                      size="small"
                      icon={<PlaceOutlinedIcon />}
                      variant="outlined"
                      sx={{ borderRadius: "7px", height: 30 }}
                    />
                  ))}
                  {service.hasHiddenBranches && (
                    <Chip
                      label="…"
                      size="small"
                      variant="outlined"
                      sx={{ borderRadius: "7px", height: 30 }}
                    />
                  )}
                </Stack>
              </Box>
            )}

            {/* Описание */}
            {service.description && (
              <Box>
                <SectionHeader icon={<NotesOutlinedIcon />} title="Описание" />
                <Box
                  sx={(t) => ({
                    p: 1.75,
                    borderRadius: "10px",
                    border: 1,
                    borderColor: "divider",
                    bgcolor: subtleBg(t),
                  })}
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ whiteSpace: "pre-wrap" }}
                  >
                    {service.description}
                  </Typography>
                </Box>
              </Box>
            )}
          </Stack>
        ) : (
          <Typography
            variant="body2"
            color="text.secondary"
            align="center"
            sx={{ py: 4 }}
          >
            Услуга не найдена
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

export default ServiceDetailsPanel;
