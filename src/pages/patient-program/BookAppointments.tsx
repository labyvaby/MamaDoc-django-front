import React from "react";
import { Box, Divider, Drawer, useMediaQuery, useTheme } from "@mui/material";
import { useQuery } from "@tanstack/react-query";

import { getAppointments, type DjangoAppointment } from "../../api/appointments";
import { getErrorMessage } from "../../api/client";
import { orgWide } from "../../api/scope";
import type { ActiveScope } from "../../hooks/useActiveScope";
import { usePermissions } from "../../hooks/usePermissions";
import { useSheetBackClose } from "../../hooks/useSheetBackClose";
import AppointmentDetailsPanel from "../appointments/components/AppointmentDetailsPanel";
import DjangoConclusionSlotsPanel from "../appointments/DjangoConclusionSlotsPanel";
import PatientHistoryPanel from "../patients/components/PatientHistoryPanel";

interface BookAppointmentsProps {
  patientId: number;
  scope: ActiveScope;
}

/**
 * История приёмов ребёнка в клинике — тот же список, что в карточке пациента
 * («История приёмов»), но по всем филиалам, как в быстром просмотре пациента:
 * книжка общая на клинику. Нажатие открывает приём и его заключение (только
 * просмотр). Раздел книжки, не модуль конструктора.
 */
export const BookAppointments: React.FC<BookAppointmentsProps> = ({ patientId, scope }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { canAccess } = usePermissions();
  const canViewFinance = canAccess("finance.view");
  const [detail, setDetail] = React.useState<DjangoAppointment | null>(null);
  const [conclusionOpen, setConclusionOpen] = React.useState(false);

  const history = useQuery({
    queryKey: ["django", "appointments", "patient-history", patientId, scope.organizationId],
    queryFn: ({ signal }) => getAppointments(orgWide(scope.organizationId), { patientId }, signal),
    enabled: scope.isReady && scope.orgReady,
    select: (rows) => [...rows].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)),
  });

  const close = () => {
    setDetail(null);
    setConclusionOpen(false);
  };
  // «Назад» на телефоне закрывает лист: сначала заключение, потом приём.
  useSheetBackClose(!!detail, close, isMobile);
  useSheetBackClose(conclusionOpen, () => setConclusionOpen(false), isMobile);

  return (
    <>
      <PatientHistoryPanel
        selected
        loading={history.isLoading}
        error={history.error ? getErrorMessage(history.error) : null}
        history={history.data ?? []}
        canViewFinance={canViewFinance}
        onClick={(appointment) => {
          setConclusionOpen(false);
          setDetail(appointment);
        }}
      />
      <Drawer
        anchor="right"
        open={!!detail}
        onClose={close}
        PaperProps={{
          sx: { width: { xs: "100%", md: conclusionOpen ? 1000 : 520 }, maxWidth: "100%", overflow: "hidden" },
        }}
      >
        {detail && (
          <Box
            sx={{
              height: "100%",
              minHeight: 0,
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              overflow: "hidden",
            }}
          >
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                overflow: "hidden",
                display: isMobile && conclusionOpen ? "none" : "block",
              }}
            >
              <AppointmentDetailsPanel
                appointment={detail}
                canUpdate={false}
                canManageFinance={false}
                canViewFinance={canViewFinance}
                isConclusionVisible={conclusionOpen}
                onToggleConclusion={() => setConclusionOpen((value) => !value)}
                onEdit={() => {}}
                onPay={() => {}}
                onClose={close}
              />
            </Box>
            {conclusionOpen && (
              <>
                {!isMobile && <Divider orientation="vertical" flexItem />}
                <Box sx={{ flex: "1 1 0", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <DjangoConclusionSlotsPanel appointmentId={detail.id} onClose={() => setConclusionOpen(false)} />
                </Box>
              </>
            )}
          </Box>
        )}
      </Drawer>
    </>
  );
};
