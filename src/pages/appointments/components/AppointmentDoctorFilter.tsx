import React from "react";
import { Avatar, Box, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import type { DjangoAppointment } from "../../../api/appointments";

interface Doctor {
  id: number;
  fullName: string;
}

interface AppointmentDoctorFilterProps {
  appointments: DjangoAppointment[];
  selectedEmployeeId: number | null;
  onSelect: (id: number | null) => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

const AppointmentDoctorFilter: React.FC<AppointmentDoctorFilterProps> = ({
  appointments,
  selectedEmployeeId,
  onSelect,
}) => {
  const theme = useTheme();

  const doctors = React.useMemo<Doctor[]>(() => {
    const map = new Map<number, string>();
    for (const appt of appointments) {
      for (const sl of appt.services) {
        if (sl.employee) {
          map.set(sl.employee.id, sl.employee.fullName);
        }
      }
    }
    return Array.from(map.entries())
      .map(([id, fullName]) => ({ id, fullName }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [appointments]);

  if (doctors.length === 0) return null;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        gap: 1,
        overflowX: "auto",
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": { display: "none" },
        px: 0.5,
        py: 0.5,
        alignItems: "center",
      }}
    >
      {/* "All" pill */}
      <Stack
        alignItems="center"
        spacing={0.25}
        onClick={() => onSelect(null)}
        sx={{ cursor: "pointer", flexShrink: 0, minWidth: 52 }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: selectedEmployeeId === null
              ? "primary.main"
              : alpha(theme.palette.action.active, 0.08),
            border: selectedEmployeeId === null
              ? "none"
              : `1.5px solid ${theme.palette.divider}`,
            transition: "all 150ms",
          }}
        >
          <Typography
            variant="caption"
            fontWeight={700}
            sx={{ color: selectedEmployeeId === null ? "primary.contrastText" : "text.secondary" }}
          >
            Все
          </Typography>
        </Box>
        <Typography
          variant="caption"
          sx={{
            fontSize: "0.68rem",
            fontWeight: selectedEmployeeId === null ? 700 : 500,
            color: selectedEmployeeId === null ? "text.primary" : "text.secondary",
          }}
        >
          Все
        </Typography>
      </Stack>

      {doctors.map((doc) => {
        const active = selectedEmployeeId === doc.id;
        return (
          <Stack
            key={doc.id}
            alignItems="center"
            spacing={0.25}
            onClick={() => onSelect(active ? null : doc.id)}
            sx={{ cursor: "pointer", flexShrink: 0, minWidth: 52 }}
          >
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                p: "2px",
                bgcolor: active ? "primary.main" : "transparent",
                border: active ? "none" : `1.5px solid ${theme.palette.divider}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 150ms",
              }}
            >
              <Avatar
                sx={{
                  width: "100%",
                  height: "100%",
                  bgcolor: active
                    ? alpha(theme.palette.primary.light, 0.4)
                    : "primary.main",
                  border: active ? `2px solid ${theme.palette.background.paper}` : "none",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                }}
              >
                {initials(doc.fullName)}
              </Avatar>
            </Box>
            <Typography
              variant="caption"
              sx={{
                fontSize: "0.68rem",
                fontWeight: active ? 700 : 500,
                color: active ? "text.primary" : "text.secondary",
                maxWidth: 56,
                textOverflow: "ellipsis",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textAlign: "center",
              }}
            >
              {getFirstName(doc.fullName)}
            </Typography>
          </Stack>
        );
      })}
    </Box>
  );
};

export default AppointmentDoctorFilter;
