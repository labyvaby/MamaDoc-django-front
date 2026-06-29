import React from "react";
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Divider,
  Stack,
  Skeleton,
  Chip,
  Avatar,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import MedicalServicesIcon from "@mui/icons-material/MedicalServicesOutlined";
import AttachMoneyIcon from "@mui/icons-material/AttachMoneyOutlined";
import AccessTimeIcon from "@mui/icons-material/AccessTimeOutlined";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import { getService } from "../../api/catalog";
import type { Service } from "../../api/catalog";
import { formatKGS } from "../../utility/format";

type Props = {
  open: boolean;
  onClose: () => void;
  serviceId: number | null;
};

const DjangoServiceQuickViewDrawer: React.FC<Props> = ({ open, onClose, serviceId }) => {
  const [loading, setLoading] = React.useState(false);
  const [service, setService] = React.useState<Service | null>(null);

  React.useEffect(() => {
    if (!serviceId || !open) {
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

      {/* Тело */}
      <Box
        sx={{
          p: 2,
          overflowY: "auto",
          flex: 1,
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        {loading ? (
          <Stack spacing={2}>
            <Skeleton variant="rectangular" height={80} />
            <Skeleton variant="text" width="60%" />
            <Skeleton variant="text" width="80%" />
          </Stack>
        ) : service ? (
          <Stack spacing={3}>
            {/* Основная информация */}
            <Box>
              <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ mb: 2 }}>
                <Avatar
                  variant="rounded"
                  src={service.imageUrl ?? undefined}
                  sx={{ bgcolor: "success.main", width: 56, height: 56 }}
                >
                  <MedicalServicesIcon />
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h6" fontWeight={600} gutterBottom>
                    {service.name}
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
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

              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <AttachMoneyIcon fontSize="small" color="action" />
                  <Typography variant="body2" color="text.secondary">
                    Стоимость:
                  </Typography>
                  <Typography variant="body2" fontWeight={500}>
                    {service.basePrice ? formatKGS(Number(service.basePrice)) : "Не указано"}
                  </Typography>
                </Stack>
                {service.durationMinutes > 0 && (
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <AccessTimeIcon fontSize="small" color="action" />
                    <Typography variant="body2" color="text.secondary">
                      Длительность:
                    </Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {service.durationMinutes} мин
                    </Typography>
                  </Stack>
                )}
                {service.branches.length > 0 && (
                  <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <LocationOnOutlinedIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
                    <Box>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Филиалы:
                      </Typography>
                      <Stack direction="row" flexWrap="wrap" gap={0.5}>
                        {service.branches.map((b) => (
                          <Chip key={b.id} label={b.name} size="small" variant="outlined" />
                        ))}
                        {service.hasHiddenBranches && (
                          <Chip label="…" size="small" variant="outlined" />
                        )}
                      </Stack>
                    </Box>
                  </Stack>
                )}
              </Stack>

              {service.description && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Box>
                    <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                      Описание
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ whiteSpace: "pre-wrap" }}
                    >
                      {service.description}
                    </Typography>
                  </Box>
                </>
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

export default DjangoServiceQuickViewDrawer;
