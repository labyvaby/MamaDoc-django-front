import React from "react";
import {
  Box,
  Button,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import dayjs, { type Dayjs } from "dayjs";

import { useCanChecker } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";
import {
  AppointmentFilters,
  type AppointmentStatusFilter,
} from "../../components/appointments/AppointmentFilters";
import { AppointmentsEmptyState } from "../../components/appointments/AppointmentsEmptyState";

type ViewMode = "list" | "day";

/**
 * Operational shell for the Appointments section (Django mode).
 *
 * Intentionally **does not** fetch anything — the matching backend API
 * is being built in a separate chat.  This component is responsible for:
 *
 * - the filter bar (date / status / search / active-branch chip);
 * - a "New appointment" button gated by ``appointments.create``;
 * - a Список / День tab switch with an operational empty state.
 *
 * When the API lands, the parent owns the filter state above; wire its
 * value into a query hook here and replace the empty state with the
 * actual list / day-column rendering.  ``onCreateAppointment`` is
 * already piped through but currently no-op'd.
 */
const AppointmentsPage: React.FC = () => {
  const { can } = useCanChecker();
  const { activeBranch } = usePermissions();

  const [date, setDate] = React.useState<Dayjs | null>(dayjs());
  const [status, setStatus] = React.useState<AppointmentStatusFilter>("all");
  const [search, setSearch] = React.useState("");
  const [view, setView] = React.useState<ViewMode>("list");

  const canCreate = can("appointments.create");
  // ``appointments.update`` is consumed by future inline-edit actions in
  // the list/day views; the variable is referenced via DOM only when a
  // row exists, so we keep it computed but the empty state hides it.
  // Future work: render a per-row edit button gated by this flag.

  const handleCreate = (): void => {
    // Placeholder.  The "create appointment" drawer / page will be
    // wired here once the appointments API is available.
  };

  return (
    <Box sx={{ p: { xs: 1, md: 2 }, height: "100%" }}>
      <Stack spacing={2} sx={{ height: "100%" }}>
        {/* ── Header ───────────────────────────────────────────────── */}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          alignItems={{ sm: "center" }}
          justifyContent="space-between"
        >
          <Stack direction="row" spacing={1.5} alignItems="baseline">
            <Typography variant="h5" fontWeight={600}>
              Приёмы
            </Typography>
            {activeBranch?.name && (
              <Typography variant="body2" color="text.secondary">
                {activeBranch.name}
              </Typography>
            )}
          </Stack>

          {canCreate && (
            <Button
              variant="contained"
              startIcon={<AddOutlined />}
              onClick={handleCreate}
              size="small"
            >
              Новый приём
            </Button>
          )}
        </Stack>

        {/* ── Filters ──────────────────────────────────────────────── */}
        <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 } }}>
          <AppointmentFilters
            date={date}
            onDateChange={setDate}
            status={status}
            onStatusChange={setStatus}
            search={search}
            onSearchChange={setSearch}
            activeBranchName={activeBranch?.name ?? null}
          />
        </Paper>

        {/* ── View switch + content ────────────────────────────────── */}
        <Paper
          variant="outlined"
          sx={{
            flex: 1,
            minHeight: 320,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <Tabs
            value={view}
            onChange={(_e, next: ViewMode) => setView(next)}
            sx={{
              borderBottom: (theme) =>
                `1px solid ${theme.palette.divider}`,
              "& .MuiTab-root": { textTransform: "none", minHeight: 44 },
            }}
          >
            <Tab value="list" label="Список" />
            <Tab value="day" label="День" />
          </Tabs>

          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflow: "auto",
              p: { xs: 1.5, md: 2 },
              display: "flex",
              flexDirection: "column",
            }}
          >
            {view === "list" ? <ListView /> : <DayView />}
          </Box>
        </Paper>
      </Stack>
    </Box>
  );
};

// ── Inner views ─────────────────────────────────────────────────────────────

/** Compact list placeholder — will be replaced by a virtualized table. */
const ListView: React.FC = () => <AppointmentsEmptyState />;

/**
 * Day-column placeholder.  Intentionally NOT a drag-drop calendar —
 * just a single column scaffold ready to accept slots later.
 */
const DayView: React.FC = () => (
  <Stack spacing={1} sx={{ flex: 1 }}>
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ pl: 0.5 }}
    >
      Расписание на день
    </Typography>
    <AppointmentsEmptyState />
  </Stack>
);

export default AppointmentsPage;
