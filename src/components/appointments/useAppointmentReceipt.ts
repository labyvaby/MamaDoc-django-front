import React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { getAppointment } from "../../api/appointments";
import { getAppointmentPayments } from "../../api/payments";
import { getPatient } from "../../api/patients";
import {
  djangoQueryKeys,
  DJANGO_DETAIL_STALE_TIME_MS,
} from "../../api/queryKeys";
import { usePermissions } from "../../hooks/usePermissions";
import { useAuthUserNames } from "../../hooks/useAuthUserNames";
import {
  printAppointmentInvoice,
  DEFAULT_INVOICE_PAGE_SIZE,
  type InvoicePageSize,
} from "./appointmentInvoice";

/**
 * Печать чека по id приёма — для экранов, где под рукой нет ни приёма, ни
 * сводки оплат (заключение знает только `appointmentId`).
 * Данные тянутся по клику: заранее грузить их незачем, чек печатают редко.
 */
export type ReceiptPrintResult =
  /** Окно печати открыто. */
  | "printed"
  /** Всплывающее окно заблокировал браузер. */
  | "blocked";

export function useAppointmentReceipt() {
  const queryClient = useQueryClient();
  const { activeOrganization, activeBranch, employee } = usePermissions();
  // Справочник ФИО берём только из кэша (enabled: false): у врача может не
  // быть доступа к /staff/employees/, и ради подписи «Регистратор» ходить
  // туда из заключения не стоит — подпись просто останется пустой.
  const userNames = useAuthUserNames(false);
  const [pending, setPending] = React.useState(false);

  const printReceipt = React.useCallback(
    async (
      appointmentId: number,
      pageSize: InvoicePageSize = DEFAULT_INVOICE_PAGE_SIZE,
    ): Promise<ReceiptPrintResult> => {
      setPending(true);
      try {
        const [appointment, summary] = await Promise.all([
          queryClient.fetchQuery({
            queryKey: djangoQueryKeys.appointments.detail(appointmentId),
            queryFn: () => getAppointment(appointmentId),
            staleTime: DJANGO_DETAIL_STALE_TIME_MS,
          }),
          queryClient.fetchQuery({
            queryKey: djangoQueryKeys.appointments.payments(appointmentId),
            queryFn: () => getAppointmentPayments(appointmentId),
            staleTime: DJANGO_DETAIL_STALE_TIME_MS,
          }),
        ]);

        // Адрес и дата рождения есть только в карточке пациента; врачу её могут
        // не отдать (403) — тогда печатаем чек без этих строк, а не падаем.
        const patientId = appointment.patient?.id ?? null;
        const patient = patientId
          ? await queryClient
              .fetchQuery({
                queryKey: djangoQueryKeys.patients.detail(patientId),
                queryFn: () => getPatient(patientId),
                staleTime: DJANGO_DETAIL_STALE_TIME_MS,
              })
              .catch(() => null)
          : null;

        const opened = printAppointmentInvoice({
          appointment,
          summary,
          patient,
          organizationName: activeOrganization?.name ?? "",
          branchName: appointment.branchName ?? activeBranch?.name ?? null,
          registrarName:
            appointment.createdById != null ? userNames[appointment.createdById] : undefined,
          createdByName: employee?.fullName ?? null,
          pageSize,
        });
        return opened ? "printed" : "blocked";
      } finally {
        setPending(false);
      }
    },
    [queryClient, activeOrganization, activeBranch, employee, userNames],
  );

  return { printReceipt, pending };
}
