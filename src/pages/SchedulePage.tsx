/**
 * SchedulePage.tsx
 * Основная страница графика работы клиники.
 * Отвечает за:
 *  - Заголовок и кнопку "Добавить смену"
 *  - Сборку всех компонентов календаря и боковых панелей
 */
import React from "react";
import { Box } from "@mui/material";
import ScheduleCalendar from "../components/schedule/ScheduleCalendar";
import { PageHeader } from "../components/ui";
import { usePageTitle } from "../hooks/usePageTitle";
import { usePermissions } from "../hooks/usePermissions";

const SchedulePage: React.FC = () => {
  usePageTitle("График");
  const calendarRef = React.useRef<{ openAddShift: () => void }>(null);

  const { isNurse: isNurseFunc, employeeId, isAdmin: isAdminFunc, isRegistrator: isRegistratorFunc, isDoctor: isDoctorFunc, hasRole } = usePermissions();
  const isNurse = isNurseFunc();
  const isAdmin = isAdminFunc();
  const isRegistrator = isRegistratorFunc();
  const isDoctor = isDoctorFunc();
  const canManageSchedule = isAdmin || isRegistrator || isDoctor;
  // Суперадмин, управляющий и регистратор видят смены всех сотрудников
  const canSeeAll = isAdmin || isRegistrator || hasRole(['manager', 'owner']);

  const handleAddShift = () => {
    calendarRef.current?.openAddShift();
  };

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}
    >
      <PageHeader
        title="График Работы Клиники"
        showTitle={false}
        addButtonText={canManageSchedule ? "Добавить смену" : undefined}
        onAdd={canManageSchedule ? handleAddShift : undefined}
      />

      <Box sx={(theme) => ({ px: theme.appLayout.page.paddingX, pb: 2, flex: 1, minHeight: 0, overflowY: "auto" })}>
        {/* Основной календарь */}
        <ScheduleCalendar
          ref={calendarRef}
          isNurse={isNurse}
          isAdmin={isAdmin}
          isRegistrator={isRegistrator}
          isDoctor={isDoctor}
          employeeId={employeeId}
          canSeeAll={canSeeAll}
        />
      </Box>
    </Box>
  );
};

export default SchedulePage;
