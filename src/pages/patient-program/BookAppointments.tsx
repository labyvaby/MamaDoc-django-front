import React from "react";
import { Box, Divider, Drawer, useMediaQuery, useTheme } from "@mui/material";
import { useQuery } from "@tanstack/react-query";

import { getAppointments, type DjangoAppointment } from "../../api/appointments";
import { getErrorMessage } from "../../api/client";
import { getPatientConclusionRows } from "../../api/medical";
import { DJANGO_DETAIL_STALE_TIME_MS, djangoQueryKeys } from "../../api/queryKeys";
import { orgWide } from "../../api/scope";
import type { ActiveScope } from "../../hooks/useActiveScope";
import { useAllActiveEmployees } from "../../hooks/useAllActiveEmployees";
import { usePermissions } from "../../hooks/usePermissions";
import { useSheetBackClose } from "../../hooks/useSheetBackClose";
import AppointmentDetailsPanel from "../appointments/components/AppointmentDetailsPanel";
import DjangoConclusionSlotsPanel from "../appointments/DjangoConclusionSlotsPanel";
import { VisitHistory } from "./visits/VisitHistory";

const NO_APPOINTMENTS: DjangoAppointment[] = [];
const NO_CONCLUSIONS: Awaited<ReturnType<typeof getPatientConclusionRows>> = [];

interface BookAppointmentsProps {
  patientId: number;
  birthDate: string | null;
  scope: ActiveScope;
}

/**
 * История приёмов ребёнка в клинике — лента по всем филиалам, как в быстром
 * просмотре пациента: книжка общая на клинику. Диагнозы — из заключений
 * (право `medical.conclusions.view`), специальности — из справочника
 * сотрудников (`staff.view`); без прав лента просто обходится без них.
 * Нажатие открывает приём и его заключение (только просмотр).
 */
export const BookAppointments: React.FC<BookAppointmentsProps> = ({ patientId, birthDate, scope }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { canAccess } = usePermissions();
  const canViewFinance = canAccess("finance.view");
  const canViewConclusions = canAccess("medical.conclusions.view");
  const [detail, setDetail] = React.useState<DjangoAppointment | null>(null);
  const [conclusionOpen, setConclusionOpen] = React.useState(false);

  const history = useQuery({
    queryKey: ["django", "appointments", "patient-history", patientId, scope.organizationId],
    queryFn: ({ signal }) => getAppointments(orgWide(scope.organizationId), { patientId }, signal),
    enabled: scope.isReady && scope.orgReady,
  });
  const conclusions = useQuery({
    queryKey: djangoQueryKeys.health.visitConclusions(patientId, scope.organizationId ?? undefined),
    queryFn: ({ signal }) => getPatientConclusionRows(patientId, signal),
    enabled: scope.isReady && scope.orgReady && canViewConclusions,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    retry: false,
  });
  const { employees } = useAllActiveEmployees(canAccess("staff.view"));
  const specialization = React.useCallback(
    (doctorId: number) => employees.find((employee) => employee.id === doctorId)?.specializations[0]?.name ?? null,
    [employees],
  );

  const close = () => {
    setDetail(null);
    setConclusionOpen(false);
  };
  // «Назад» на телефоне закрывает лист: сначала заключение, потом приём.
  useSheetBackClose(!!detail, close, isMobile);
  useSheetBackClose(conclusionOpen, () => setConclusionOpen(false), isMobile);

  return (
    <>
      <VisitHistory
        loading={history.isLoading}
        error={history.error ? getErrorMessage(history.error) : null}
        appointments={history.data ?? NO_APPOINTMENTS}
        conclusions={conclusions.data ?? NO_CONCLUSIONS}
        birthDate={birthDate}
        canViewFinance={canViewFinance}
        specialization={specialization}
        onOpen={(appointment) => {
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
