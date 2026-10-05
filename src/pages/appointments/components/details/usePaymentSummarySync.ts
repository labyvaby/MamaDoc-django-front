import React from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { PaymentSummary } from "../../../../api/payments";
import { djangoQueryKeys } from "../../../../api/queryKeys";

/**
 * Свежая сводка оплат после правки/удаления/возврата: кладём её в кэш сразу
 * (без лишнего GET) и будим всё, что показывает деньги приёма — список дня,
 * счётчики, домашний агрегат и кассу. Тот же набор, что у формы оплаты.
 */
export function usePaymentSummarySync(patientId: number | null) {
  const queryClient = useQueryClient();
  return React.useCallback(
    (summary: PaymentSummary) => {
      queryClient.setQueryData(
        djangoQueryKeys.appointments.payments(summary.appointmentId),
        summary,
      );
      void queryClient.invalidateQueries({
        queryKey: djangoQueryKeys.appointments.payments(summary.appointmentId),
      });
      void queryClient.invalidateQueries({ queryKey: ["django", "appointments", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["django", "appointments", "day-counts"] });
      void queryClient.invalidateQueries({ queryKey: ["django", "appointments", "home"] });
      void queryClient.invalidateQueries({ queryKey: ["django", "cashbox"] });
      if (patientId) {
        void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.patients.balance(patientId) });
        void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.patients.transactions(patientId) });
      }
    },
    [patientId, queryClient],
  );
}
