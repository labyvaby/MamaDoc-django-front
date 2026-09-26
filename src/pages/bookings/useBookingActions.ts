import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import { useNavigate } from "react-router";

import {
  claimBooking,
  getBooking,
  unclaimBooking,
  updateBookingStatus,
  type BookingDetail,
} from "../../api/bookings";
import { djangoQueryKeys } from "../../api/queryKeys";
import { getServiceAssignments } from "../../api/appointments";
import { autoConfirmExtras, doctorServiceIdsOf } from "./bookingViews";

/** Результат быстрого подтверждения из строки списка. */
export type QuickConfirmResult =
  | { kind: "confirmed"; id: number }
  /** Карта не однозначна или в заявке нет услуг — выбор делается в диалоге подтверждения. */
  | { kind: "needs-review"; id: number };

export { autoConfirmExtras } from "./bookingViews";

/**
 * Услуги врача брони в её филиале. Ошибка матрицы не блокирует подтверждение —
 * тогда проверку делает бэк при сохранении приёма.
 */
export async function loadDoctorServiceIds(
  detail: Pick<BookingDetail, "doctorId" | "branchId">,
): Promise<Set<number> | null> {
  if (detail.doctorId == null) return null;
  const assignments = await getServiceAssignments(detail.branchId ?? undefined).catch(() => null);
  return doctorServiceIdsOf(assignments, detail.doctorId);
}

/** Чем закрывают пропущенную заявку (см. `isBookingMissed`). */
export type MissedCloseStatus = "no_show" | "cancelled";

/**
 * Действия над бронью, общие для строки списка и карточки: «взять в работу»,
 * снять отметку, подтвердить в один клик, закрыть пропущенную, перезаписать.
 */
export function useBookingActions(opts: { onNeedsReview?: (id: number) => void } = {}) {
  const queryClient = useQueryClient();
  const { open: notify } = useNotification();
  const navigate = useNavigate();

  const applyDetail = (data: BookingDetail) => {
    queryClient.setQueryData(djangoQueryKeys.bookings.detail(data.id), data);
    queryClient.invalidateQueries({ queryKey: djangoQueryKeys.bookings.all });
  };

  const onError = (e: unknown) =>
    notify?.({ type: "error", message: e instanceof Error ? e.message : "Ошибка" });

  const claim = useMutation({
    mutationFn: (id: number) => claimBooking(id),
    onSuccess: applyDetail,
    onError,
  });

  const unclaim = useMutation({
    mutationFn: (id: number) => unclaimBooking(id),
    onSuccess: applyDetail,
    onError,
  });

  /**
   * Подтверждение без открытия карточки — та же логика, что у массового:
   * только при ровно одной карте по телефону; услуги берём из брони. Иначе
   * отдаём бронь на разбор в карточку (`onNeedsReview`).
   *
   * Перед сменой статуса никем не взятую заявку берём на себя: так у каждой
   * разобранной заявки есть время реакции, даже если «Взять в работу» не жали.
   */
  const quickConfirm = useMutation({
    mutationFn: async (id: number): Promise<QuickConfirmResult> => {
      const detail = await getBooking(id);
      const extras = autoConfirmExtras(detail, await loadDoctorServiceIds(detail));
      if (!extras) return { kind: "needs-review", id };
      if (!detail.claimedAt) await claimBooking(id).catch(() => undefined);
      const data = await updateBookingStatus(id, "confirmed", extras);
      queryClient.setQueryData(djangoQueryKeys.bookings.detail(data.id), data);
      return { kind: "confirmed", id };
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.bookings.all });
      if (r.kind === "confirmed") {
        // Подтверждение материализует приём.
        queryClient.invalidateQueries({ queryKey: djangoQueryKeys.appointments.all });
        notify?.({ type: "success", message: "Онлайн-запись подтверждена" });
      } else {
        // Сразу открывается диалог подтверждения — там видно, чего не хватает.
        opts.onNeedsReview?.(r.id);
      }
    },
    onError,
  });

  /**
   * Закрыть пропущенную заявку без приёма: «Неявка» или «Отменить». Переход
   * `pending → no_show` бэк принимает (проверено на тесте 16.09.2026: 200,
   * `appointmentId: null`). Взятие в работу — то же правило, что у подтверждения.
   */
  const closeMissed = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: MissedCloseStatus }) => {
      const detail = await getBooking(id);
      if (!detail.claimedAt) await claimBooking(id).catch(() => undefined);
      return updateBookingStatus(id, status);
    },
    onSuccess: (data, vars) => {
      applyDetail(data);
      notify?.({
        type: "success",
        message:
          vars.status === "no_show" ? "Онлайн-запись закрыта: неявка" : "Онлайн-запись отменена",
      });
    },
    onError,
  });

  /**
   * Перезаписать пропущенную заявку: открыть форму приёма с пациентом (карта
   * по телефону, если она одна), специалистом и услугой из заявки. Сама заявка
   * закрывается, когда приём создан — `bookingId` читает регистратура
   * (`AppointmentsPage`), как `waitlistId` у листа ожидания. Закрывать до
   * перехода нельзя: регистратор может не дозвониться и не записать.
   */
  const rebook = useMutation({
    mutationFn: async (id: number) => {
      const detail = await getBooking(id);
      const params = new URLSearchParams({ new: "1", bookingId: String(id) });
      const matches = detail.patientMatches ?? [];
      if (matches.length === 1) params.set("patient", String(matches[0].id));
      if (detail.doctorId != null) params.set("employee", String(detail.doctorId));
      const serviceId = (detail.services ?? []).find((s) => s.id != null)?.id;
      if (serviceId != null) params.set("service", String(serviceId));
      navigate(`/appointments?${params.toString()}`);
    },
    onError,
  });

  return { claim, unclaim, quickConfirm, closeMissed, rebook };
}
