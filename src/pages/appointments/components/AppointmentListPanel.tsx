import React from "react";
import {
  Avatar,
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";
import dayjs from "dayjs";

import type { DjangoAppointment } from "../../../api/appointments";
import AppointmentRow from "./AppointmentRow";

interface AppointmentListPanelProps {
  items: DjangoAppointment[];
  loading: boolean;
  error: string | null;
  date: import("dayjs").Dayjs | null;
  selectedId: number | null;
  canUpdate: boolean;
  canManageFinance: boolean;
  canViewFinance: boolean;
  onSelect: (a: DjangoAppointment) => void;
  onEdit: (a: DjangoAppointment) => void;
  onPay: (a: DjangoAppointment) => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

// Instagram-style doctor story bubble
const DoctorBubble: React.FC<{
  id: number | null;
  name: string;
  active: boolean;
  onClick: () => void;
}> = ({ id, name, active, onClick }) => {
  const theme = useTheme();
  const label = id === null ? "Все" : initials(name);
  const caption = id === null ? "Все" : getFirstName(name);

  return (
    <Stack
      alignItems="center"
      spacing={0.25}
      onClick={onClick}
      sx={{ cursor: "pointer", flexShrink: 0, minWidth: 56, userSelect: "none" }}
    >
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          p: "3px",
          bgcolor: active ? "primary.main" : "transparent",
          border: active ? "none" : `1.5px solid ${theme.palette.divider}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 150ms",
        }}
      >
        {id === null ? (
          <Box
            sx={{
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: active ? alpha(theme.palette.primary.light, 0.4) : alpha(theme.palette.action.active, 0.08),
              border: active ? `2px solid ${theme.palette.background.paper}` : "none",
            }}
          >
            <Typography variant="caption" fontWeight={700} sx={{ color: active ? "primary.contrastText" : "text.secondary", fontSize: "0.7rem" }}>
              Все
            </Typography>
          </Box>
        ) : (
          <Avatar
            sx={{
              width: "100%",
              height: "100%",
              bgcolor: active ? alpha(theme.palette.primary.light, 0.4) : "primary.main",
              border: active ? `2px solid ${theme.palette.background.paper}` : "none",
              fontSize: "0.85rem",
              fontWeight: 700,
              color: active ? "primary.main" : "primary.contrastText",
            }}
          >
            {label}
          </Avatar>
        )}
      </Box>
      <Typography
        variant="caption"
        sx={{
          fontSize: "0.68rem",
          fontWeight: active ? 700 : 500,
          color: active ? "text.primary" : "text.secondary",
          maxWidth: 64,
          textOverflow: "ellipsis",
          overflow: "hidden",
          whiteSpace: "nowrap",
          textAlign: "center",
        }}
      >
        {caption}
      </Typography>
    </Stack>
  );
};

const AppointmentListPanel: React.FC<AppointmentListPanelProps> = ({
  items,
  loading,
  error,
  date,
  selectedId,
  canUpdate,
  canManageFinance,
  canViewFinance,
  onSelect,
  onEdit,
  onPay,
}) => {
  const [filterEmployeeId, setFilterEmployeeId] = React.useState<number | null>(null);

  // Reset doctor filter when date changes
  React.useEffect(() => {
    setFilterEmployeeId(null);
  }, [date?.format("YYYY-MM-DD")]);

  // Build doctor list from appointments
  const doctors = React.useMemo<{ id: number; fullName: string }[]>(() => {
    const map = new Map<number, string>();
    for (const appt of items) {
      for (const sl of appt.services) {
        if (sl.employee) {
          map.set(sl.employee.id, sl.employee.fullName);
        }
      }
    }
    return Array.from(map.entries())
      .map(([id, fullName]) => ({ id, fullName }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [items]);

  const filteredItems = React.useMemo(() => {
    if (filterEmployeeId === null) return items;
    return items.filter((appt) =>
      appt.services.some((sl) => sl.employee?.id === filterEmployeeId),
    );
  }, [items, filterEmployeeId]);

  // Group by employee for section headers
  const groups = React.useMemo(() => {
    const map = new Map<string, { label: string; items: DjangoAppointment[] }>();

    for (const appt of filteredItems) {
      const uniqueEmps = Array.from(
        new Map(
          appt.services
            .filter((sl) => sl.employee != null)
            .map((sl) => [sl.employee!.id, sl.employee!.fullName]),
        ).values(),
      );

      const groupKey =
        uniqueEmps.length === 0
          ? "__no_doctor__"
          : uniqueEmps.length === 1
          ? String(
              appt.services.find((sl) => sl.employee != null)?.employee?.id ??
                "__multi__",
            )
          : "__multi__";

      const groupLabel =
        uniqueEmps.length === 0
          ? "Без врача"
          : uniqueEmps.length === 1
          ? uniqueEmps[0]
          : "Несколько врачей";

      if (!map.has(groupKey)) map.set(groupKey, { label: groupLabel, items: [] });
      map.get(groupKey)!.items.push(appt);
    }

    const arr = Array.from(map.values());
    arr.sort((a) => (a.label === "Без врача" ? 1 : -1));
    return arr;
  }, [filteredItems]);

  // Drag-scroll for doctor strip
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const isDragging = React.useRef(false);
  const startX = React.useRef(0);
  const scrollLeft = React.useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    isDragging.current = true;
    startX.current = e.pageX - scrollRef.current.offsetLeft;
    scrollLeft.current = scrollRef.current.scrollLeft;
    scrollRef.current.style.cursor = "grabbing";
  };
  const onMouseLeave = () => { isDragging.current = false; if (scrollRef.current) scrollRef.current.style.cursor = "grab"; };
  const onMouseUp = () => { isDragging.current = false; if (scrollRef.current) scrollRef.current.style.cursor = "grab"; };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX.current) * 2;
    scrollRef.current.scrollLeft = scrollLeft.current - walk;
  };

  const titleDate = date ? date.format("DD.MM.YYYY") : "";

  return (
    <Card
      variant="outlined"
      sx={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      {/* Card header: Приёмы + date */}
      <CardHeader
        sx={{
          pb: 1,
          pt: 1.5,
          px: 2,
          "& .MuiCardHeader-content": { minWidth: 0 },
        }}
        title={
          <Stack direction="column" spacing={1.5}>
            <Typography variant="subtitle1" fontWeight={700} noWrap>
              Приёмы{titleDate ? ` (${titleDate})` : ""}
            </Typography>

            {/* Doctor story strip */}
            {doctors.length > 0 && (
              <Box
                ref={scrollRef}
                onMouseDown={onMouseDown}
                onMouseLeave={onMouseLeave}
                onMouseUp={onMouseUp}
                onMouseMove={onMouseMove}
                sx={{
                  display: "flex",
                  flexDirection: "row",
                  gap: 1.5,
                  overflowX: "auto",
                  scrollbarWidth: "none",
                  "&::-webkit-scrollbar": { display: "none" },
                  cursor: "grab",
                  pb: 0.5,
                  mx: -2,
                  px: 2,
                }}
              >
                {/* "All" bubble */}
                <DoctorBubble
                  id={null}
                  name="Все"
                  active={filterEmployeeId === null}
                  onClick={() => setFilterEmployeeId(null)}
                />
                {doctors.map((doc) => (
                  <DoctorBubble
                    key={doc.id}
                    id={doc.id}
                    name={doc.fullName}
                    active={filterEmployeeId === doc.id}
                    onClick={() => setFilterEmployeeId(filterEmployeeId === doc.id ? null : doc.id)}
                  />
                ))}
                <Box sx={{ minWidth: 8, flexShrink: 0 }} />
              </Box>
            )}
          </Stack>
        }
      />

      {loading && <LinearProgress sx={{ height: 2, mt: "-2px" }} />}
      <Divider />

      <CardContent
        sx={{
          p: 0,
          "&:last-child": { pb: 0 },
          flex: 1,
          overflowY: "auto",
          msOverflowStyle: "none",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        {error ? (
          <Typography sx={{ p: 2 }} variant="body2" color="error">
            {error}
          </Typography>
        ) : loading && filteredItems.length === 0 ? (
          <Stack alignItems="center" justifyContent="center" py={6} spacing={1}>
            <CircularProgress size={28} />
            <Typography variant="caption" color="text.secondary">Загрузка…</Typography>
          </Stack>
        ) : filteredItems.length === 0 ? (
          <Stack alignItems="center" justifyContent="center" py={6} spacing={1} color="text.secondary">
            <EventBusyOutlined sx={{ fontSize: 40, opacity: 0.3 }} />
            <Typography variant="body2">
              {date ? `Нет приёмов на ${date.format("D MMMM YYYY")}` : "Нет приёмов"}
            </Typography>
          </Stack>
        ) : (
          <Stack spacing={0}>
            {groups.map((group, gi) => (
              <Box key={gi}>
                {/* Group header */}
                <Box
                  sx={{
                    px: 2,
                    py: 0.75,
                    bgcolor: "action.selected",
                    borderTop: gi > 0 ? "1px solid" : "none",
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  <Typography variant="subtitle2" fontWeight={700}>
                    {group.label}
                  </Typography>
                  <Chip
                    label={`${group.items.length} ${
                      group.items.length === 1
                        ? "приём"
                        : group.items.length < 5
                        ? "приёма"
                        : "приёмов"
                    }`}
                    size="small"
                    variant="outlined"
                    sx={{ height: 20, fontSize: "0.7rem", fontWeight: 700, bgcolor: "background.paper" }}
                  />
                </Box>

                <Box>
                  {group.items.map((appt) => (
                    <AppointmentRow
                      key={appt.id}
                      appointment={appt}
                      selected={selectedId === appt.id}
                      canUpdate={canUpdate}
                      canManageFinance={canManageFinance}
                      canViewFinance={canViewFinance}
                      onClick={onSelect}
                      onEdit={onEdit}
                      onPay={onPay}
                    />
                  ))}
                </Box>
              </Box>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
};

export default AppointmentListPanel;
