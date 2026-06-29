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
import LocalPhoneOutlinedIcon from "@mui/icons-material/LocalPhoneOutlined";
import CakeOutlinedIcon from "@mui/icons-material/CakeOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import dayjs from "dayjs";
import "dayjs/locale/ru";

import { getPatient, type DjangoPatient } from "../../api/patients";

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

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

function ageLabel(birthDate: string | null): string {
  if (!birthDate) return "";
  const b = dayjs(birthDate);
  if (!b.isValid()) return "";
  const now = dayjs();
  const years = now.diff(b, "year");
  if (years >= 1) return `${years} ${plural(years, ["год", "года", "лет"])}`;
  const months = now.diff(b, "month");
  return `${months} ${plural(months, ["месяц", "месяца", "месяцев"])}`;
}

const DjangoPatientQuickViewDrawer: React.FC<Props> = ({ open, onClose, patientId }) => {
  const [loading, setLoading] = React.useState(false);
  const [patient, setPatient] = React.useState<DjangoPatient | null>(null);

  React.useEffect(() => {
    if (!patientId || !open) {
      setPatient(null);
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
                    {ageLabel(patient.birthDate) ? ` (${ageLabel(patient.birthDate)})` : ""}
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
