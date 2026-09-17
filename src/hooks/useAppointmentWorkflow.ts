import React from "react";

import { usePermissions } from "./usePermissions";
import {
  readAppointmentWorkflow,
  type AppointmentWorkflowSettings,
} from "../config/appointmentWorkflow";

/**
 * Настройки хода приёма активной организации из /auth/me/.
 *
 * Пересобираются только при смене самого themeConfig — объект приходит с
 * бэка целиком, поэтому ссылочная стабильность через useMemo достаточна.
 */
export const useAppointmentWorkflow = (): AppointmentWorkflowSettings => {
  const { activeOrganization } = usePermissions();
  const themeConfig = activeOrganization?.themeConfig;
  return React.useMemo(() => readAppointmentWorkflow(themeConfig), [themeConfig]);
};
